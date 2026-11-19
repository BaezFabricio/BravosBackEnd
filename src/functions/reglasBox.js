const db = require('../config/db');

/*
 * Reglas del box para reservar y cancelar clases. Las edita el administrador en Configuración del box → Reglas de reservas.
 * Los valores por defecto son los que el sistema usaba fijos antes, así que mientras nadie las cambie nada se comporta distinto.
 *
 *  - horasReservar: con cuántas horas de anticipación como mínimo se puede reservar (la reserva cierra ese tiempo antes de la clase).
 *  - horasCancelar: con cuántas horas de anticipación como mínimo se cancela recuperando el crédito.
 *  - diasAdelante:  cuántos días hacia adelante se puede reservar (0 = solo las clases del día).
 */
const POR_DEFECTO = { horasReservar: 2, horasCancelar: 2, diasAdelante: 0 };
const LIMITES = {
  horasReservar: { min: 0, max: 48, nombre: 'Las horas de anticipación para reservar' },
  horasCancelar: { min: 0, max: 72, nombre: 'Las horas de anticipación para cancelar' },
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
      horasReservar INT NOT NULL DEFAULT 2,
      horasCancelar INT NOT NULL DEFAULT 2,
      diasAdelante INT NOT NULL DEFAULT 0,
      actualizadaEn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query('INSERT IGNORE INTO regla_box (id) VALUES (1)');
  tablaLista = true;
}

/** Reglas vigentes. Si no se pueden leer, se usan las de siempre (nunca se frena una reserva por no poder leerlas). */
async function obtenerReglas() {
  if (cache && Date.now() < cacheHasta) return cache;
  try {
    await asegurarTabla();
    const [filas] = await db.query('SELECT horasReservar, horasCancelar, diasAdelante FROM regla_box WHERE id = 1');
    const f = filas[0];
    cache = f
      ? { horasReservar: Number(f.horasReservar), horasCancelar: Number(f.horasCancelar), diasAdelante: Number(f.diasAdelante) }
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
    'UPDATE regla_box SET horasReservar = ?, horasCancelar = ?, diasAdelante = ? WHERE id = 1',
    [reglas.horasReservar, reglas.horasCancelar, reglas.diasAdelante]
  );
  cache = { ...reglas };
  cacheHasta = Date.now() + 15000;
  return cache;
}

module.exports = { POR_DEFECTO, LIMITES, obtenerReglas, validarReglas, guardarReglas };
