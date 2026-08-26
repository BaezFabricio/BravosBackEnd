const db = require('../config/db');
const obtenerAlumnosActivos = require('../data/Alumno/ObtenerAlumnosActivos');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { crearNotificacion } = require('../functions/notificacion.service');

/**
 * Reemplaza por completo los ejercicios de una rutina (borra e inserta de nuevo).
 * Reutilizado tanto por el profesor (rutinas propias) como por el admin (rutina
 * vinculada a una clase).
 */
async function syncEjercicios(idRutina, ejercicios) {
  if (!Array.isArray(ejercicios)) return;

  await db.query('DELETE FROM ejercicio WHERE idRutina = ?', [idRutina]);

  let orden = 0;
  for (const ej of ejercicios) {
    if (!ej.nombre) continue;
    await db.query(
      'INSERT INTO ejercicio (nombre, videoUrl, orden, idRutina) VALUES (?, ?, ?, ?)',
      [ej.nombre, ej.videoUrl || null, orden, idRutina]
    );
    orden += 1;
  }
}

module.exports.syncEjercicios = syncEjercicios;

/**
 * GET /rutinas/alumnos-disponibles
 * Lista de alumnos activos para asignar a una rutina
 */
exports.getAlumnosDisponibles = asyncHandler(async (req, res) => {
  const [alumnos] = await db.query(obtenerAlumnosActivos);
  return successResponse(res, 'Alumnos disponibles obtenidos correctamente', alumnos);
});

/**
 * GET /rutinas
 * Lista las rutinas del profesor autenticado (o todas, si es admin)
 */
exports.getAll = asyncHandler(async (req, res) => {
  const esAdmin = Number(req.user?.idPerfil) === 1;
  const idProfesor = req.user?.idProfesor;

  if (!esAdmin && !idProfesor) {
    return errorResponse(res, 'Tu usuario no está vinculado a un perfil de profesor.', 'NOT_PROFESOR', 403);
  }

  const params = [];
  let filtro = '';
  if (!esAdmin) {
    filtro = 'WHERE r.idProfesor = ?';
    params.push(idProfesor);
  }

  const [rutinas] = await db.query(
    `
    SELECT
      r.idRutina, r.nombre, r.descripcion, r.nivel, r.duracion, r.idProfesor,
      r.idClase, r.categoria, c.nombreClase,
      CASE
        WHEN r.idClase IS NOT NULL THEN (
          SELECT COUNT(DISTINCT res.idAlumno)
          FROM asistencia asi
          INNER JOIN reserva res ON asi.idReserva = res.idReserva
          INNER JOIN horarioclase hc ON res.idHorario = hc.idHorario
          WHERE hc.idClase = r.idClase AND asi.estado = 'presente'
        )
        ELSE COUNT(DISTINCT ar.idAlumno)
      END AS cantidadAlumnos
    FROM rutina r
    LEFT JOIN alumnorutina ar ON ar.idRutina = r.idRutina
    LEFT JOIN diaclase c ON c.idClase = r.idClase
    ${filtro}
    GROUP BY r.idRutina
    ORDER BY r.idRutina DESC
    `,
    params
  );

  return successResponse(res, 'Rutinas obtenidas correctamente', rutinas);
});

/**
 * GET /rutinas/:id
 * Detalle de una rutina con sus alumnos asignados
 */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const esAdmin = Number(req.user?.idPerfil) === 1;

  const [rutinaRows] = await db.query('SELECT * FROM rutina WHERE idRutina = ?', [id]);

  if (rutinaRows.length === 0) {
    return errorResponse(res, 'Rutina no encontrada', 'NOT_FOUND', 404);
  }

  const rutina = rutinaRows[0];

  if (!esAdmin && rutina.idProfesor !== req.user?.idProfesor) {
    return errorResponse(res, 'No tenés permiso para ver esta rutina.', 'FORBIDDEN', 403);
  }

  const [alumnos] = await db.query(
    `
    SELECT a.idAlumno, p.nombrecompleto
    FROM alumnorutina ar
    INNER JOIN alumno a ON ar.idAlumno = a.idAlumno
    INNER JOIN persona p ON a.idPersona = p.idpersona
    WHERE ar.idRutina = ?
    ORDER BY p.nombrecompleto
    `,
    [id]
  );

  const [ejercicios] = await db.query(
    'SELECT idEjercicio, nombre, videoUrl, orden FROM ejercicio WHERE idRutina = ? ORDER BY orden ASC',
    [id]
  );

  let nombreClase = null;
  if (rutina.idClase) {
    const [claseRows] = await db.query('SELECT nombreClase FROM diaclase WHERE idClase = ?', [rutina.idClase]);
    nombreClase = claseRows[0]?.nombreClase || null;
  }

  return successResponse(res, 'Rutina obtenida correctamente', { ...rutina, alumnos, ejercicios, nombreClase });
});

/**
 * POST /rutinas
 * Crea una rutina y asigna alumnos (opcional)
 */
exports.insert = asyncHandler(async (req, res) => {
  const { nombre, descripcion, nivel, duracion, categoria, alumnos, ejercicios } = req.body;
  const idProfesor = req.user?.idProfesor;

  if (!idProfesor) {
    return errorResponse(res, 'Tu usuario no está vinculado a un perfil de profesor.', 'NOT_PROFESOR', 403);
  }

  if (!nombre) {
    return errorResponse(res, 'El nombre de la rutina es obligatorio.', 'MISSING_FIELDS', 400);
  }

  const [result] = await db.query(
    'INSERT INTO rutina (nombre, descripcion, nivel, duracion, categoria, idProfesor) VALUES (?, ?, ?, ?, ?, ?)',
    [nombre, descripcion || null, nivel || null, duracion || null, categoria || null, idProfesor]
  );

  const idRutina = result.insertId;

  if (Array.isArray(alumnos) && alumnos.length > 0) {
    for (const idAlumno of alumnos) {
      await db.query('INSERT INTO alumnorutina (idAlumno, idRutina) VALUES (?, ?)', [idAlumno, idRutina]);
    }
  }

  await syncEjercicios(idRutina, ejercicios);

  // Notificar a los alumnos asignados directamente
  if (Array.isArray(alumnos) && alumnos.length > 0) {
    const [alumnoRows] = await db.query(
      `SELECT u.idUsuario FROM alumno a
       INNER JOIN usuario u ON a.idPersona = u.idPersona
       WHERE a.idAlumno IN (${alumnos.map(() => '?').join(',')})`,
      alumnos
    );
    for (const row of alumnoRows) {
      crearNotificacion(row.idUsuario, 'sistema',
        'Nueva rutina asignada',
        `Se te asignó la rutina "${nombre}". Podés verla en tu panel.`
      );
    }
  }

  return successResponse(res, 'Rutina creada correctamente', {
    idRutina, nombre, descripcion, nivel, duracion, categoria, idProfesor,
    alumnos: alumnos || [], ejercicios: ejercicios || []
  }, 201);
});

/**
 * PUT /rutinas/:id
 * Actualiza una rutina y resincroniza los alumnos asignados
 */
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, nivel, duracion, categoria, alumnos, ejercicios } = req.body;
  const esAdmin = Number(req.user?.idPerfil) === 1;

  const [rutinaRows] = await db.query('SELECT * FROM rutina WHERE idRutina = ?', [id]);

  if (rutinaRows.length === 0) {
    return errorResponse(res, 'Rutina no encontrada', 'NOT_FOUND', 404);
  }

  if (!esAdmin && rutinaRows[0].idProfesor !== req.user?.idProfesor) {
    return errorResponse(res, 'No tenés permiso para editar esta rutina.', 'FORBIDDEN', 403);
  }

  if (!nombre) {
    return errorResponse(res, 'El nombre de la rutina es obligatorio.', 'MISSING_FIELDS', 400);
  }

  await db.query(
    'UPDATE rutina SET nombre = ?, descripcion = ?, nivel = ?, duracion = ?, categoria = ? WHERE idRutina = ?',
    [nombre, descripcion || null, nivel || null, duracion || null, categoria || null, id]
  );

  if (Array.isArray(alumnos)) {
    await db.query('DELETE FROM alumnorutina WHERE idRutina = ?', [id]);
    for (const idAlumno of alumnos) {
      await db.query('INSERT INTO alumnorutina (idAlumno, idRutina) VALUES (?, ?)', [idAlumno, id]);
    }
  }

  await syncEjercicios(id, ejercicios);

  return successResponse(res, 'Rutina actualizada correctamente', {
    idRutina: Number(id), nombre, descripcion, nivel, duracion, categoria
  });
});

/**
 * DELETE /rutinas/:id
 */
exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const esAdmin = Number(req.user?.idPerfil) === 1;

  const [rutinaRows] = await db.query('SELECT * FROM rutina WHERE idRutina = ?', [id]);

  if (rutinaRows.length === 0) {
    return errorResponse(res, 'Rutina no encontrada', 'NOT_FOUND', 404);
  }

  if (!esAdmin && rutinaRows[0].idProfesor !== req.user?.idProfesor) {
    return errorResponse(res, 'No tenés permiso para eliminar esta rutina.', 'FORBIDDEN', 403);
  }

  await db.query('DELETE FROM alumnorutina WHERE idRutina = ?', [id]);
  await db.query('DELETE FROM rutina WHERE idRutina = ?', [id]);

  return successResponse(res, 'Rutina eliminada correctamente');
});
