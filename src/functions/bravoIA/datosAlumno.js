/**
 * Datos de LA PROPIA persona que le pasamos al asistente (solo lectura).
 *
 * Todo se filtra por el idUsuario que sale del token de la sesión: nunca por un id que mande el navegador,
 * así que nadie puede pedirle al asistente los datos de otro alumno. Se mandan solo los campos necesarios.
 */
const db = require('../../config/db');

async function datosDelAlumno(idUsuario) {
  const [persona] = await db.query(
    `SELECT p.nombrecompleto
       FROM usuario u INNER JOIN persona p ON u.idPersona = p.idpersona
      WHERE u.idUsuario = ?`,
    [idUsuario]
  );

  // Membresías vigentes con lo que importa para explicar los créditos
  const [planes] = await db.query(
    `SELECT pl.nombre AS plan, c.totalCreditos AS creditosTotales, c.creditosCisponibles AS creditosDisponibles,
            pl.creditosPorSemana AS creditosPorSemana,
            DATE_FORMAT(c.fechaVencimiento, '%Y-%m-%d') AS vence,
            DATEDIFF(c.fechaVencimiento, CURDATE()) AS diasParaVencer
       FROM credito c
       INNER JOIN alumno a ON c.idAlumno = a.idAlumno
       INNER JOIN usuario u ON a.idPersona = u.idPersona
       INNER JOIN pago p ON c.idPago = p.idPago
       INNER JOIN plan pl ON p.idPlan = pl.idPlan
      WHERE u.idUsuario = ? AND c.estado = 'ACTIVO' AND c.fechaVencimiento >= CURDATE()
      ORDER BY c.fechaVencimiento ASC, c.idCredito ASC`,
    [idUsuario]
  );

  const [reservas] = await db.query(
    `SELECT DATE_FORMAT(r.fechaReserva, '%Y-%m-%d') AS fecha, TIME_FORMAT(h.horaInicio, '%H:%i') AS hora, c.nombreClase AS clase
       FROM reserva r
       INNER JOIN alumno a ON r.idAlumno = a.idAlumno
       INNER JOIN usuario u ON a.idPersona = u.idPersona
       INNER JOIN horarioclase h ON r.idHorario = h.idHorario
       INNER JOIN diaclase c ON h.idClase = c.idClase
      WHERE u.idUsuario = ? AND r.estado = 'proxima'
        AND (r.fechaReserva > CURDATE() OR (r.fechaReserva = CURDATE() AND h.horaFin > CURTIME()))
      ORDER BY r.fechaReserva ASC, h.horaInicio ASC
      LIMIT 5`,
    [idUsuario]
  );

  // Últimas membresías pagadas (lo que ve en "Mi membresía"): plan, importe, forma de pago y estado
  const [pagos] = await db.query(
    `SELECT pl.nombre AS plan, p.importe, p.formaPago,
            DATE_FORMAT(c.fechaInicio, '%Y-%m-%d') AS desde, DATE_FORMAT(c.fechaVencimiento, '%Y-%m-%d') AS hasta,
            CASE WHEN c.estado = 'CANCELADO' THEN 'cancelada'
                 WHEN c.fechaVencimiento < CURDATE() THEN 'vencida' ELSE 'vigente' END AS estado
       FROM credito c
       INNER JOIN alumno a ON c.idAlumno = a.idAlumno
       INNER JOIN usuario u ON a.idPersona = u.idPersona
       LEFT JOIN pago p ON c.idPago = p.idPago
       LEFT JOIN plan pl ON p.idPlan = pl.idPlan
      WHERE u.idUsuario = ?
      ORDER BY c.fechaInicio DESC, c.idCredito DESC
      LIMIT 4`,
    [idUsuario]
  );

  const nombre = String(persona[0]?.nombrecompleto || '').trim().split(' ')[0] || null;

  return {
    nombrePila: nombre,
    membresiasVigentes: planes.map((p) => ({
      ...p,
      tipoDePlan: p.creditosPorSemana ? `con ${p.creditosPorSemana} créditos por semana` : 'sin cupo semanal (descuenta 1 crédito por día de apertura)',
      diasParaVencer: Number(p.diasParaVencer),
    })),
    creditosDisponiblesEnTotal: planes.reduce((acc, p) => acc + Number(p.creditosDisponibles || 0), 0),
    proximasReservas: reservas,
    ultimasMembresias: pagos.map((p) => ({ ...p, importe: p.importe == null ? null : Number(p.importe) })),
  };
}

module.exports = { datosDelAlumno };
