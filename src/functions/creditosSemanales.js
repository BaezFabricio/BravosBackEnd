const db = require('../config/db');

/*
 * Créditos por semana. Un plan puede tener "créditos por semana" (el de 3 días = 3):
 *   - De lunes a domingo se pueden reservar hasta esa cantidad de clases (cada reserva usa 1 crédito; cancelar NO lo devuelve).
 *   - Lo que no se usó en la semana se pierde cuando la semana termina: este proceso lo descuenta del saldo, una sola vez por semana.
 *     Un crédito ya usado reservando cuenta para la semana, así que nunca se gasta dos veces.
 *   - El total del plan (por ejemplo 12) sigue siendo el tope del mes; los planes sin "créditos por semana" funcionan como siempre.
 * La semana es la de MySQL YEARWEEK(fecha, 1): empieza el lunes. Las reservas se ubican en la semana de la FECHA DE LA CLASE.
 */
const dos = (n) => String(n).padStart(2, '0');
const fechaTxt = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
// Lunes de la semana de una fecha "AAAA-MM-DD" (al mediodía para que la hora de verano no corra el día)
const lunesDe = (txt) => {
  const d = new Date(`${txt}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};

async function existeColumna(tabla, columna) {
  const [filas] = await db.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [tabla, columna]
  );
  return filas.length > 0;
}

/** Crea lo que hace falta en la base (se puede llamar en cada arranque). */
async function prepararCreditosSemanales() {
  if (!(await existeColumna('plan', 'creditosPorSemana'))) {
    await db.query('ALTER TABLE plan ADD COLUMN creditosPorSemana INT NULL AFTER cantidadCreditos');
  }
  if (!(await existeColumna('credito', 'semanaDescontada'))) {
    await db.query('ALTER TABLE credito ADD COLUMN semanaDescontada INT NULL');
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS credito_descuento (
      idDescuento INT AUTO_INCREMENT PRIMARY KEY,
      idCredito INT NOT NULL,
      semana INT NOT NULL,
      cantidad INT NOT NULL,
      fecha DATE NOT NULL,
      UNIQUE KEY uq_credito_semana (idCredito, semana)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci
  `);
}

/**
 * Descuenta los créditos que sobraron en cada semana ya terminada, para los créditos de planes con "créditos por semana".
 * Se puede correr todas las veces que se quiera: cada semana se descuenta una sola vez (credito.semanaDescontada).
 * Devuelve cuántos créditos se descontaron en total.
 */
async function descontarSemanasCumplidas() {
  const [creditos] = await db.query(`
    SELECT c.idCredito, c.creditosCisponibles AS disponibles, c.semanaDescontada,
           DATE_FORMAT(c.fechaInicio, '%Y-%m-%d') AS inicio, DATE_FORMAT(c.fechaVencimiento, '%Y-%m-%d') AS vence,
           pl.creditosPorSemana AS porSemana
      FROM credito c
      INNER JOIN pago p ON p.idPago = c.idPago
      INNER JOIN plan pl ON pl.idPlan = p.idPlan
     WHERE c.estado = 'ACTIVO' AND pl.creditosPorSemana IS NOT NULL AND c.creditosCisponibles > 0
  `);

  const lunesActual = lunesDe(fechaTxt(new Date()));
  let total = 0;

  for (const c of creditos) {
    let disponibles = Number(c.disponibles);
    let ultima = c.semanaDescontada ? Number(c.semanaDescontada) : 0;
    const lunes = lunesDe(c.inicio);

    // Cada semana completa (que ya terminó) desde que empezó el crédito, mientras el crédito siga vigente
    while (lunes < lunesActual && fechaTxt(lunes) <= c.vence && disponibles > 0) {
      const [[{ semana }]] = await db.query('SELECT YEARWEEK(?, 1) AS semana', [fechaTxt(lunes)]);
      if (Number(semana) > ultima) {
        const [[{ usadas }]] = await db.query(
          'SELECT COUNT(*) AS usadas FROM reserva WHERE idCredito = ? AND YEARWEEK(fechaReserva, 1) = ?',
          [c.idCredito, semana]
        );
        const sobra = Math.min(Math.max(Number(c.porSemana) - Number(usadas), 0), disponibles);
        await db.query(
          `UPDATE credito SET creditosCisponibles = creditosCisponibles - ?, creditosUtilizados = creditosUtilizados + ?, semanaDescontada = ?
            WHERE idCredito = ?`,
          [sobra, sobra, semana, c.idCredito]
        );
        if (sobra > 0) {
          const viernes = new Date(lunes); viernes.setDate(viernes.getDate() + 4);
          await db.query(
            'INSERT IGNORE INTO credito_descuento (idCredito, semana, cantidad, fecha) VALUES (?, ?, ?, ?)',
            [c.idCredito, semana, sobra, fechaTxt(viernes)]
          );
        }
        disponibles -= sobra;
        total += sobra;
        ultima = Number(semana);
      }
      lunes.setDate(lunes.getDate() + 7);
    }
  }
  return total;
}

/** Corre al iniciar el servidor y cada hora (la semana "se cierra" apenas llega el lunes). */
function iniciarCronCreditosSemanales() {
  const correr = () => descontarSemanasCumplidas()
    .then((n) => { if (n > 0) console.log(`[Cron Créditos] ${n} crédito(s) sin usar descontados de semanas terminadas.`); })
    .catch((err) => console.error('[Cron Créditos] Error:', err.message));
  setInterval(correr, 60 * 60 * 1000);
  correr();
  console.log('[Cron] Cron de créditos semanales iniciado (cada 1 h)');
}

module.exports = { prepararCreditosSemanales, descontarSemanasCumplidas, iniciarCronCreditosSemanales };
