const db = require('../config/db');

/*
 * Reglas del box para reservar y cancelar clases. Las edita el administrador en Configuración del box → Reglas de reservas.
 * Los valores por defecto son los que el sistema usaba fijos antes (2 horas = 120 minutos), así que mientras nadie las cambie
 * nada se comporta distinto.
 *
 *  - minutosReservar: con cuántos minutos de anticipación como mínimo se puede reservar (la reserva cierra ese tiempo antes de la clase).
 *  - minutosCancelar: con cuántos minutos de anticipación como mínimo se cancela recuperando el crédito.
 *  - diasAdelante:    cuántos días hacia adelante se puede reservar (0 = solo las clases del día).
 */
const POR_DEFECTO = { minutosReservar: 120, minutosCancelar: 120, diasAdelante: 0 };
const LIMITES = {
  minutosReservar: { min: 0, max: 2880, nombre: 'La anticipación para reservar' },   // hasta 48 horas
  minutosCancelar: { min: 0, max: 4320, nombre: 'La anticipación para cancelar' },   // hasta 72 horas
  diasAdelante: { min: 0, max: 14, nombre: 'Los días hacia adelante para reservar' },
};

let tablaLista = false;
let cache = null;
let cacheHasta = 0;

async function asegurarTabla() {
  if (tablaLista) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS regla_box (
      id TINYINT NOT NULL PRIMARY KEY,
      minutosReservar INT NOT NULL DEFAULT 120,
      minutosCancelar INT NOT NULL DEFAULT 120,
      diasAdelante INT NOT NULL DEFAULT 0,
      actualizadaEn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // La primera versión guardaba horas enteras (horasReservar / horasCancelar): se pasan a minutos sin perder lo que ya se configuró
  const [columnas] = await db.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'regla_box'"
  );
  const tiene = new Set(columnas.map((c) => c.COLUMN_NAME));
  for (const [minutos, horas] of [['minutosReservar', 'horasReservar'], ['minutosCancelar', 'horasCancelar']]) {
    if (!tiene.has(minutos)) {
      await db.query(`ALTER TABLE regla_box ADD COLUMN ${minutos} INT NOT NULL DEFAULT 120`);
      if (tiene.has(horas)) await db.query(`UPDATE regla_box SET ${minutos} = ${horas} * 60`);
    }
  }
  await db.query('INSERT IGNORE INTO regla_box (id) VALUES (1)');
  tablaLista = true;
}

/** Reglas vigentes. Si no se pueden leer, se usan las de siempre (nunca se frena una reserva por no poder leerlas). */
async function obtenerReglas() {
  if (cache && Date.now() < cacheHasta) return cache;
  try {
    await asegurarTabla();
    const [filas] = await db.query('SELECT minutosReservar, minutosCancelar, diasAdelante FROM regla_box WHERE id = 1');
    const f = filas[0];
    cache = f
      ? { minutosReservar: Number(f.minutosReservar), minutosCancelar: Number(f.minutosCancelar), diasAdelante: Number(f.diasAdelante) }
      : { ...POR_DEFECTO };
  } catch (error) {
    console.error('[reglasBox] No se pudieron leer las reglas, se usan las de siempre:', error.message);
    return cache || { ...POR_DEFECTO };
  }
  cacheHasta = Date.now() + 15000;
  return cache;
}

/** Valida lo que manda el cliente: números enteros dentro de los límites. Devuelve { reglas } o { error }. */
function validarReglas(cuerpo = {}) {
  const reglas = {};
  for (const [clave, { min, max, nombre }] of Object.entries(LIMITES)) {
    const valor = cuerpo[clave];
    if (valor === undefined || valor === null || valor === '' || !Number.isInteger(Number(valor))) {
      return { error: `${nombre} tiene que ser un número entero.` };
    }
    const n = Number(valor);
    if (n < min || n > max) return { error: `${nombre} tiene que estar entre ${min} y ${max}.` };
    reglas[clave] = n;
  }
  return { reglas };
}

async function guardarReglas(reglas) {
  await asegurarTabla();
  await db.query(
    'UPDATE regla_box SET minutosReservar = ?, minutosCancelar = ?, diasAdelante = ? WHERE id = 1',
    [reglas.minutosReservar, reglas.minutosCancelar, reglas.diasAdelante]
  );
  cache = { ...reglas };
  cacheHasta = Date.now() + 15000;
  return cache;
}

/** "30 minutos" · "1 hora" · "2 horas" · "1 hora y 30 min" (para los mensajes que ve el alumno) */
function tiempoTexto(minutos) {
  const m = Math.round(Number(minutos) || 0);
  if (m < 60) return `${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  const horas = `${h} ${h === 1 ? 'hora' : 'horas'}`;
  return resto ? `${horas} y ${resto} min` : horas;
}

module.exports = { POR_DEFECTO, LIMITES, obtenerReglas, validarReglas, guardarReglas, tiempoTexto };
