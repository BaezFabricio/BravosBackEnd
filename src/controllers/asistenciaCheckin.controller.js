const crypto = require('crypto');
const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

/*
 * Check-in del gimnasio: el alumno escribe su DNI y se registra su asistencia de hoy.
 * Solo sirve para quien tiene una reserva para hoy, en el horario de la clase (desde 1 hora antes hasta que termina).
 * La pantalla no tiene sesión: el equipo se identifica con una clave (CHECKIN_CLAVE en el .env del servidor).
 * La respuesta solo trae lo necesario para el alumno: nombre de pila, clase, créditos y vencimiento. Nunca DNI, correo ni teléfono.
 */

const claveValida = (recibida) => {
  const esperada = process.env.CHECKIN_CLAVE || '';
  if (!esperada || !recibida) return false;
  const a = Buffer.from(String(recibida));
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const primerNombre = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || '';
const fechaCorta = (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : null);

exports.registrarEntrada = asyncHandler(async (req, res) => {
  if (!process.env.CHECKIN_CLAVE) return errorResponse(res, 'La pantalla de check-in no está configurada en el servidor.', 'CHECKIN_NO_CONFIG', 503);
  if (!claveValida(req.get('x-clave-checkin'))) return errorResponse(res, 'La clave de este equipo no es válida.', 'CHECKIN_CLAVE_INVALIDA', 401);

  const dni = String(req.body?.dni || '').replace(/\D/g, '');
  if (dni.length < 6 || dni.length > 10) return errorResponse(res, 'Escribí tu DNI sin puntos.', 'VALIDATION_ERROR', 400);

  const [personas] = await db.query(
    `SELECT a.idAlumno, p.nombrecompleto
     FROM persona p
     INNER JOIN alumno a ON a.idPersona = p.idPersona
     INNER JOIN usuario u ON u.idPersona = p.idPersona
     WHERE p.dni = ? AND u.estado = 'activo'
     LIMIT 1`,
    [dni]
  );
  const noTiene = 'No encontramos una reserva tuya para hoy. Si tenés una, consultá en la recepción.';
  if (!personas.length) return errorResponse(res, noTiene, 'SIN_RESERVA', 404);
  const alumno = personas[0];

  // La reserva de hoy que corresponde a este momento (empieza dentro de 1 hora o está en curso)
  const [reservas] = await db.query(
    `SELECT r.idReserva, r.idCredito, r.estado, c.nombreClase,
            TIME_FORMAT(h.horaInicio, '%H:%i') AS horaInicio, TIME_FORMAT(h.horaFin, '%H:%i') AS horaFin,
            asi.idAsistencia, asi.estado AS estadoAsistencia, asi.observacion
     FROM reserva r
     INNER JOIN horarioclase h ON h.idHorario = r.idHorario
     INNER JOIN diaclase c ON c.idClase = h.idClase
     LEFT JOIN asistencia asi ON asi.idReserva = r.idReserva
     WHERE r.idAlumno = ? AND r.fechaReserva = CURDATE() AND r.estado = 'proxima'
       AND CURTIME() >= SUBTIME(h.horaInicio, '01:00:00') AND CURTIME() <= h.horaFin
     ORDER BY h.horaInicio
     LIMIT 1`,
    [alumno.idAlumno]
  );
  if (!reservas.length) return errorResponse(res, noTiene, 'SIN_RESERVA', 404);
  const reserva = reservas[0];

  // Si ya quedó registrada (por el alumno en la app, por esta pantalla o por el profesor), no se vuelve a cargar
  if (!reserva.idAsistencia) {
    await db.query(
      "INSERT INTO asistencia (fecha, estado, observacion, idReserva) VALUES (CURDATE(), 'presente', 'checkin', ?)",
      [reserva.idReserva]
    );
  } else if (reserva.estadoAsistencia !== 'presente' && reserva.observacion !== 'checkin') {
    // El profesor la marcó como ausente: la pantalla no la cambia
    return errorResponse(res, 'Tu profesor ya registró tu asistencia de hoy. Consultá en la recepción.', 'YA_REGISTRADA', 409);
  }

  // Créditos y vencimiento del alumno (el crédito de la reserva de hoy primero)
  const [creditos] = await db.query(
    `SELECT c.creditosCisponibles AS disponibles, DATE_FORMAT(c.fechaVencimiento, '%Y-%m-%d') AS vence,
            pl.creditosPorSemana AS porSemana, pl.nombre AS plan
     FROM credito c
     INNER JOIN pago pg ON pg.idPago = c.idPago
     INNER JOIN plan pl ON pl.idPlan = pg.idPlan
     WHERE c.idAlumno = ? AND c.estado = 'ACTIVO' AND c.fechaVencimiento >= CURDATE()
     ORDER BY (c.idCredito = ?) DESC, c.fechaVencimiento ASC`,
    [alumno.idAlumno, reserva.idCredito]
  );
  const totalDisponibles = creditos.reduce((acc, c) => acc + Number(c.disponibles || 0), 0);
  const principal = creditos[0] || null;

  // Esta semana: cuántas clases usó del plan de la reserva (las del mismo crédito, esta semana)
  let semana = null;
  if (principal && principal.porSemana) {
    const [[{ usadas }]] = await db.query(
      'SELECT COUNT(*) AS usadas FROM reserva WHERE idCredito = ? AND YEARWEEK(fechaReserva, 1) = YEARWEEK(CURDATE(), 1)',
      [reserva.idCredito]
    );
    semana = { usadas: Number(usadas) || 0, total: Number(principal.porSemana) };
  }

  return successResponse(res, 'Asistencia registrada', {
    bienvenida: `¡Bienvenido, ${primerNombre(alumno.nombrecompleto)}!`,
    clase: { nombre: reserva.nombreClase, inicio: reserva.horaInicio, fin: reserva.horaFin },
    plan: principal ? principal.plan : null,
    semana,
    clasesDisponibles: totalDisponibles,
    vence: principal ? fechaCorta(principal.vence) : null,
  }, 201);
});
