const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

// Importaciones de tus archivos de datos
const obtenerProfesoresActivos = require('../data/Profesores/ObtenerProfesoresActivos');
const obtenerAlumnosPorReserva = require('../data/Profesores/ObtenerAlumnosPorReserva');
const obtenerClasesPorProfesor = require('../data/Profesores/ObtenerClasesPorProfesor');

// 1. Obtener todos los profesores
exports.getAll = asyncHandler(async (req, res) => {
  const [profesores] = await db.query(obtenerProfesoresActivos);
  return successResponse(res, 'Profesores activos recuperados correctamente', profesores);
});

exports.getMisClases = asyncHandler(async (req, res) => {
  const idProfesor = req.user?.idProfesor;

  if (!idProfesor) {
    return errorResponse(res, 'No se pudo identificar el perfil de profesor desde el token. Cerrá sesión y volvé a entrar.', 'NO_PROFESOR', 403);
  }

  const [clases] = await db.query(`
    SELECT
      c.idClase,
      c.nombreClase,
      c.tipoClase,
      c.cupoMaximo,
      c.cupoDisponible,
      c.estado,
      GROUP_CONCAT(h.dia ORDER BY FIELD(h.dia,'LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO') SEPARATOR ', ') AS dias,
      MIN(h.horaInicio) AS horaInicio,
      MIN(h.horaFin) AS horaFin
    FROM diaclase c
    LEFT JOIN horarioclase h ON c.idClase = h.idClase
    WHERE c.idProfesor = ?
    GROUP BY c.idClase, c.nombreClase, c.tipoClase, c.cupoMaximo, c.cupoDisponible, c.estado
    ORDER BY c.nombreClase
  `, [idProfesor]);

  return successResponse(res, 'Clases del profesor recuperadas correctamente', clases);
});

// 3. Obtener alumnos de una clase por fecha (con su asistencia ya registrada, si existe)
//    Acepta opcionalmente idHorario para desambiguar clases con más de un horario el mismo día.
exports.getAlumnosPorClase = asyncHandler(async (req, res) => {
  const { idClase } = req.params;
  const { fecha, idHorario } = req.query;

  if (!fecha) {
    return errorResponse(res, 'La fecha es obligatoria para tomar lista.', 'MISSING_FECHA', 400);
  }

  // La clase seleccionada ya define el contexto del profesor; no filtramos por idProfesor
  // (el token no lo trae y el fallback fijo a 1 rompía la lista para el resto de los coaches).
  // Traemos el idReserva (FK real de asistencia) y el estado ya guardado con un LEFT JOIN.
  const params = [idClase, fecha];
  let filtroHorario = '';
  if (idHorario) {
    filtroHorario = 'AND h.idHorario = ?';
    params.push(idHorario);
  }

  const sql = `
    SELECT
        r.idReserva,
        a.idAlumno AS id,
        p.nombrecompleto,
        COALESCE(asi.estado, r.estado) AS asistencia
    FROM reserva r
    INNER JOIN alumno a ON r.idAlumno = a.idAlumno
    INNER JOIN persona p ON a.idPersona = p.idPersona
    INNER JOIN horarioclase h ON r.idHorario = h.idHorario
    INNER JOIN diaclase c ON h.idClase = c.idClase
    LEFT JOIN asistencia asi ON asi.idReserva = r.idReserva
    WHERE c.idClase = ?
      AND r.fechaReserva = ?
      ${filtroHorario}
      AND r.estado = 'proxima'
    ORDER BY p.nombrecompleto
  `;

  const [alumnos] = await db.query(sql, params);
  return successResponse(res, 'Alumnos recuperados correctamente', alumnos);
});

// 5. Horarios de una clase (para el selector de "Horario" al tomar asistencia)
exports.getHorariosPorClase = asyncHandler(async (req, res) => {
  const { idClase } = req.params;

  const [horarios] = await db.query(
    'SELECT idHorario, dia, horaInicio, horaFin, turno FROM horarioclase WHERE idClase = ? ORDER BY FIELD(dia, "LUNES","MARTES","MIERCOLES","JUEVES","VIERNES","SABADO","DOMINGO"), horaInicio',
    [idClase]
  );

  return successResponse(res, 'Horarios recuperados correctamente', horarios);
});

// 6. Rutina (con ejercicios) vinculada a una clase, para mostrarla al profesor al tomar asistencia
exports.getRutinaPorClase = asyncHandler(async (req, res) => {
  const { idClase } = req.params;

  const [rutinaRows] = await db.query('SELECT * FROM rutina WHERE idClase = ?', [idClase]);

  if (rutinaRows.length === 0) {
    return successResponse(res, 'La clase no tiene rutina asignada.', null);
  }

  const [ejercicios] = await db.query(
    'SELECT idEjercicio, nombre, videoUrl, orden FROM ejercicio WHERE idRutina = ? ORDER BY orden ASC',
    [rutinaRows[0].idRutina]
  );

  return successResponse(res, 'Rutina recuperada correctamente', { ...rutinaRows[0], ejercicios });
});

// 4. Marcar (o actualizar) la asistencia de una reserva
exports.marcarAsistencia = asyncHandler(async (req, res) => {
  const { idReserva } = req.params;
  const { estado, observacion } = req.body;

  const permitidos = ['presente', 'ausente'];
  if (!estado || !permitidos.includes(String(estado).toLowerCase())) {
    return errorResponse(res, "El estado debe ser 'presente' o 'ausente'.", 'INVALID_ESTADO', 400);
  }

  // Validamos que la reserva exista y tomamos su fecha como fecha de asistencia
  const [reservaRows] = await db.query(
    'SELECT idReserva, fechaReserva FROM reserva WHERE idReserva = ?',
    [idReserva]
  );

  if (reservaRows.length === 0) {
    return errorResponse(res, 'La reserva indicada no existe.', 'NOT_FOUND', 404);
  }

  const fecha = reservaRows[0].fechaReserva;

  // Upsert manual: una sola asistencia por reserva
  const [existente] = await db.query(
    'SELECT idAsistencia FROM asistencia WHERE idReserva = ?',
    [idReserva]
  );

  if (existente.length > 0) {
    await db.query(
      'UPDATE asistencia SET estado = ?, observacion = ?, fecha = ? WHERE idReserva = ?',
      [estado, observacion || null, fecha, idReserva]
    );
  } else {
    await db.query(
      'INSERT INTO asistencia (fecha, estado, observacion, idReserva) VALUES (?, ?, ?, ?)',
      [fecha, estado, observacion || null, idReserva]
    );
  }

  return successResponse(res, 'Asistencia registrada correctamente.', {
    idReserva: Number(idReserva),
    estado
  });
});