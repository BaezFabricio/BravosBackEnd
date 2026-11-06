const crypto = require('crypto');
const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

/*
 * Check-in del gimnasio: el alumno escribe su DNI y se registra su asistencia de hoy, solo si tiene reserva en este horario.
 * La pantalla no tiene sesión: el equipo de recepción se identifica con una clave que genera el administrador desde el panel
 * (Check-in). La clave se guarda solo como huella (hash): al generarla se muestra una sola vez.
 * La respuesta solo trae lo necesario para el alumno: nombre de pila, clase, créditos y vencimiento. Nunca DNI, correo ni teléfono.
 */

const TABLA = `
  CREATE TABLE IF NOT EXISTS checkin_config (
    id INT PRIMARY KEY,
    claveHash CHAR(64) NOT NULL,
    creadaEn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;
let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await db.query(TABLA);
  tablaLista = true;
}

// La clave se compara sin guiones y en mayúsculas: da igual cómo la escriba la recepción (K7RP3M9Q o k7rp-3m9q)
const huella = (clave) => crypto.createHash('sha256').update(String(clave).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

async function claveValida(recibida) {
  if (!recibida) return false;
  await asegurarTabla();
  const [[fila]] = await db.query('SELECT claveHash FROM checkin_config WHERE id = 1');
  if (!fila) return false;
  const a = Buffer.from(huella(recibida));
  const b = Buffer.from(fila.claveHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const fechaCorta = (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : null);
const primerNombre = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || '';

/** POST /asistencia/check-in { dni } — sin sesión; exige la clave del equipo (cabecera x-clave-checkin) */
exports.registrarEntrada = asyncHandler(async (req, res) => {
  if (!(await claveValida(req.get('x-clave-checkin')))) {
    return errorResponse(res, 'La clave de este equipo no es válida. Pedí una nueva al administrador.', 'CHECKIN_CLAVE_INVALIDA', 401);
  }

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

  // Si ya quedó registrada (por el alumno en la app, por el check-in o por el profesor), no se vuelve a cargar
  if (!reserva.idAsistencia) {
    await db.query(
      "INSERT INTO asistencia (fecha, estado, observacion, idReserva) VALUES (CURDATE(), 'presente', 'checkin', ?)",
      [reserva.idReserva]
    );
  } else if (reserva.estadoAsistencia !== 'presente' && reserva.observacion !== 'checkin') {
    return errorResponse(res, 'Tu profesor ya registró tu asistencia de hoy. Consultá en la recepción.', 'YA_REGISTRADA', 409);
  }

  // Créditos y vencimiento (el crédito de la reserva de hoy primero)
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

  // Esta semana: clases usadas de ese mismo crédito (si el plan tiene límite semanal)
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

/** GET /asistencia/check-in/estado — para el panel: si hay clave, y cuántos check-in hubo hoy */
exports.estado = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  await asegurarTabla();
  const [[fila]] = await db.query('SELECT creadaEn FROM checkin_config WHERE id = 1');
  const [[{ hoy }]] = await db.query("SELECT COUNT(*) AS hoy FROM asistencia WHERE fecha = CURDATE() AND observacion = 'checkin'");
  return successResponse(res, 'Estado del check-in', {
    configurado: Boolean(fila),
    creadaEn: fila ? String(fila.creadaEn).slice(0, 16) : null,
    registradosHoy: Number(hoy) || 0,
  });
});

/** POST /asistencia/check-in/clave { clave } — la elige el administrador (frase reconocible, mínimo 12 caracteres). Se guarda solo la huella. */
exports.guardarClave = asyncHandler(async (req, res) => {
  const clave = String(req.body?.clave || '').trim();
  if (clave.length < 12 || clave.length > 60) {
    return errorResponse(res, 'La clave tiene que tener entre 12 y 60 caracteres. Ejemplo: Recepcion-Bravos-2026', 'VALIDATION_ERROR', 400);
  }
  if (huella(clave).length === 0 || clave.replace(/[^A-Za-z0-9]/g, '').length < 12) {
    return errorResponse(res, 'La clave tiene que tener al menos 12 letras o números (los guiones no cuentan).', 'VALIDATION_ERROR', 400);
  }
  await asegurarTabla();
  await db.query(
    'INSERT INTO checkin_config (id, claveHash) VALUES (1, ?) ON DUPLICATE KEY UPDATE claveHash = VALUES(claveHash), creadaEn = CURRENT_TIMESTAMP',
    [huella(clave)]
  );
  return successResponse(res, 'Clave guardada', null, 200);
});
