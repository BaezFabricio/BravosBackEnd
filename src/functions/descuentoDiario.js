const db = require('../config/db');

/*
 * Descuento diario de créditos (planes SIN cupo semanal, por ejemplo Planificación Atleta y Clase CrossFit).
 *   - Cada día de apertura se descuenta 1 crédito a cada alumno con plan activo, reserve o no.
 *   - Si el alumno reserva ese día, la reserva es el cobro de ese día (no se descuenta otro crédito).
 *   - Si cancela con 2 horas o más de anticipación, la reserva se devuelve y el día vuelve a cobrarse.
 *   - Domingos nunca se descuentan. Sábados: pendiente de definir (DESCUENTA_SABADO).
 *   - El plan con "créditos por semana" (x12 días) NO entra acá: sigue con su regla semanal.
 * Marca de cobro: tabla credito_dia (idCredito, fecha). Si existe, ese día ya tiene su crédito cobrado.
 * Reserva.cobroCredito = 1 si esa reserva es el cobro de su día; 0 si el día ya estaba cobrado.
 */
const DESCUENTA_SABADO = false; // TODO: definir. Mientras tanto los sábados no se descuentan.

const fechaDeHoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()); // AAAA-MM-DD
const esDiaDeApertura = (fecha) => {
  const dia = new Date(`${fecha}T12:00:00`).getDay(); // 0 domingo, 6 sábado
  if (dia === 0) return false;
  if (dia === 6) return DESCUENTA_SABADO;
  return true;
};

/** Crea lo que hace falta en la base (se puede llamar en cada arranque). */
async function prepararDescuentoDiario() {
  await db.query(`CREATE TABLE IF NOT EXISTS credito_dia (
    idCredito INT NOT NULL,
    fecha DATE NOT NULL,
    PRIMARY KEY (idCredito, fecha)
  )`);
  try {
    await db.query('ALTER TABLE reserva ADD COLUMN cobroCredito TINYINT(1) NOT NULL DEFAULT 1');
  } catch { /* ya existe */ }
}

/**
 * Cobra el día de hoy a los planes sin cupo semanal que no tengan el día cubierto.
 * Se puede correr todas las veces que se quiera: cada día se cobra una sola vez.
 * Devuelve cuántos créditos se descontaron.
 */
async function descontarDiaDeHoy() {
  const hoy = fechaDeHoy();
  if (!esDiaDeApertura(hoy)) return 0;

  const [creditos] = await db.query(`
    SELECT c.idCredito
      FROM credito c
      INNER JOIN pago p ON p.idPago = c.idPago
      INNER JOIN plan pl ON pl.idPlan = p.idPlan
     WHERE c.estado = 'ACTIVO'
       AND pl.creditosPorSemana IS NULL
       AND c.creditosCisponibles > 0
       AND DATE_FORMAT(c.fechaInicio, '%Y-%m-%d') <= ?
       AND DATE_FORMAT(c.fechaVencimiento, '%Y-%m-%d') >= ?
  `, [hoy, hoy]);

  let descontados = 0;
  for (const c of creditos) {
    // Si ya hay una reserva que cobra ese día, el día ya está cubierto
    const [[cubierto]] = await db.query(
      'SELECT COUNT(*) AS n FROM reserva WHERE idCredito = ? AND fechaReserva = ? AND cobroCredito = 1',
      [c.idCredito, hoy]
    );
    if (Number(cubierto.n) > 0) continue;

    // Marca del día: si ya estaba, no se vuelve a cobrar
    const [marca] = await db.query('INSERT IGNORE INTO credito_dia (idCredito, fecha) VALUES (?, ?)', [c.idCredito, hoy]);
    if (marca.affectedRows === 0) continue;

    const [res] = await db.query(
      `UPDATE credito SET creditosCisponibles = creditosCisponibles - 1, creditosUtilizados = creditosUtilizados + 1
        WHERE idCredito = ? AND creditosCisponibles > 0`,
      [c.idCredito]
    );
    if (res.affectedRows === 0) {
      await db.query('DELETE FROM credito_dia WHERE idCredito = ? AND fecha = ?', [c.idCredito, hoy]);
      continue;
    }
    descontados++;
  }
  return descontados;
}

/** Corre al iniciar el servidor y cada hora. */
function iniciarCronDescuentoDiario() {
  const correr = () => descontarDiaDeHoy()
    .then((n) => { if (n > 0) console.log(`[Cron Diario] ${n} crédito(s) descontados por el día de hoy.`); })
    .catch((err) => console.error('[Cron Diario] Error:', err.message));
  setInterval(correr, 60 * 60 * 1000);
  correr();
  console.log('[Cron] Cron de descuento diario iniciado (cada 1 h)');
}

module.exports = { prepararDescuentoDiario, descontarDiaDeHoy, iniciarCronDescuentoDiario, DESCUENTA_SABADO };
