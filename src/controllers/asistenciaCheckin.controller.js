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

  // Reservas de hoy del alumno. Cada clase se puede registrar desde 30 minutos antes de que empiece hasta que termina.
  const [reservasHoy] = await db.query(
    `SELECT r.idReserva, r.idCredito, r.estado, c.nombreClase,
            TIME_FORMAT(h.horaInicio, '%H:%i') AS horaInicio, TIME_FORMAT(h.horaFin, '%H:%i') AS horaFin,
            TIME_FORMAT(SUBTIME(h.horaInicio, '00:30:00'), '%H:%i') AS desde,
            (CURTIME() >= SUBTIME(h.horaInicio, '00:30:00') AND CURTIME() <= h.horaFin) AS enVentana,
            (CURTIME() < SUBTIME(h.horaInicio, '00:30:00')) AS temprano,
            asi.idAsistencia, asi.estado AS estadoAsistencia, asi.observacion
     FROM reserva r
     INNER JOIN horarioclase h ON h.idHorario = r.idHorario
     INNER JOIN diaclase c ON c.idClase = h.idClase
     LEFT JOIN asistencia asi ON asi.idReserva = r.idReserva
     WHERE r.idAlumno = ? AND r.fechaReserva = CURDATE() AND r.estado = 'proxima'
     ORDER BY h.horaInicio`,
    [alumno.idAlumno]
  );
  if (!reservasHoy.length) return errorResponse(res, noTiene, 'SIN_RESERVA', 404);

  // Si hay más de una clase en ventana (clases seguidas), se registra la primera que todavía no tiene asistencia
  const enVentana = reservasHoy.filter((r) => Number(r.enVentana) === 1);
  if (!enVentana.length) {
    const proxima = reservasHoy.find((r) => Number(r.temprano) === 1);
    if (proxima) {
      return errorResponse(res, `Tu clase de las ${proxima.horaInicio} se habilita para registrarte desde las ${proxima.desde}.`, 'FUERA_DE_HORARIO', 409);
    }
    return errorResponse(res, 'Tu clase de hoy ya terminó, así que no se puede registrar la asistencia. Consultá en la recepción.', 'FUERA_DE_HORARIO', 409);
  }
  const reserva = enVentana.find((r) => !r.idAsistencia) || enVentana[0];

  // Si ya quedó registrada (por el check-in o por el profesor), no se vuelve a cargar
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

/** GET /asistencia/check-in/estado — para el panel: si hay clave, y el detalle de hoy por clase y tipo */
exports.estado = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  await asegurarTabla();
  const [[fila]] = await db.query('SELECT creadaEn FROM checkin_config WHERE id = 1');

  // Clases de hoy (las recurrentes del día de la semana y las únicas de hoy), con reservados y registrados
  const [clases] = await db.query(`
    SELECT h.idHorario, c.nombreClase, c.tipoPlan, tc.nombre AS tipo,
           TIME_FORMAT(h.horaInicio, '%H:%i') AS inicio, TIME_FORMAT(h.horaFin, '%H:%i') AS fin,
           (SELECT COUNT(*) FROM reserva r WHERE r.idHorario = h.idHorario AND r.fechaReserva = CURDATE() AND r.estado = 'proxima') AS reservados,
           (SELECT COUNT(*) FROM asistencia a INNER JOIN reserva r ON r.idReserva = a.idReserva
             WHERE r.idHorario = h.idHorario AND a.fecha = CURDATE() AND a.estado = 'presente') AS registrados
    FROM horarioclase h
    INNER JOIN diaclase c ON c.idClase = h.idClase
    LEFT JOIN tipo_clase tc ON tc.codigo = c.tipoPlan
    WHERE c.estado = 'Activo'
      AND (h.fechaEspecifica = CURDATE()
           OR (h.fechaEspecifica IS NULL AND h.dia = ELT(WEEKDAY(CURDATE()) + 1, 'LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO')))
    ORDER BY h.horaInicio
  `);

  // Quién se registró hoy (nombre de pila y apellido, la clase y de dónde vino el registro)
  const [registrados] = await db.query(`
    SELECT p.nombrecompleto, c.nombreClase, TIME_FORMAT(h.horaInicio, '%H:%i') AS inicio, a.observacion
    FROM asistencia a
    INNER JOIN reserva r ON r.idReserva = a.idReserva
    INNER JOIN horarioclase h ON h.idHorario = r.idHorario
    INNER JOIN diaclase c ON c.idClase = h.idClase
    INNER JOIN alumno al ON al.idAlumno = r.idAlumno
    INNER JOIN persona p ON p.idPersona = al.idPersona
    WHERE a.fecha = CURDATE() AND a.estado = 'presente'
    ORDER BY h.horaInicio, p.nombrecompleto
    LIMIT 200
  `);

  // Resumen por tipo de clase (CrossFit, Planificación, etc.)
  const porTipo = {};
  for (const c of clases) {
    const t = c.tipo || 'Sin tipo';
    porTipo[t] = porTipo[t] || { tipo: t, reservados: 0, registrados: 0 };
    porTipo[t].reservados += Number(c.reservados) || 0;
    porTipo[t].registrados += Number(c.registrados) || 0;
  }

  const origen = (obs) => (obs === 'checkin' ? 'Check-in' : obs === 'autoregistro' ? 'Desde la app' : 'Profesor');
  const totalRegistrados = registrados.length;
  return successResponse(res, 'Estado del check-in', {
    configurado: Boolean(fila),
    creadaEn: fila ? String(fila.creadaEn).slice(0, 16) : null,
    registradosHoy: totalRegistrados,
    porTipo: Object.values(porTipo),
    clasesHoy: clases.map((c) => ({
      idHorario: c.idHorario, nombre: c.nombreClase, tipo: c.tipo || 'Sin tipo', inicio: c.inicio, fin: c.fin,
      reservados: Number(c.reservados) || 0, registrados: Number(c.registrados) || 0,
    })),
    registrados: registrados.map((r) => ({
      nombre: r.nombrecompleto, clase: r.nombreClase, inicio: r.inicio, origen: origen(r.observacion),
    })),
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
