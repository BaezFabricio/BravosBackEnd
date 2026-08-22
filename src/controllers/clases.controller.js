const db = require('../config/db');

const obtenerClases = require('../data/Clases/ObtenerClases');
const obtenerClasePorId = require('../data/Clases/ObtenerClasePorId');
const insertarClase = require('../data/Clases/InsertarClase');
const actualizarClase = require('../data/Clases/ActualizarClase');
const actualizarEstadoClase = require('../data/Clases/ActualizarEstadoClase');
const eliminarClase = require('../data/Clases/EliminarClase');
const insertarHorarioClase = require('../data/HorariosClase/InsertarHorarioClase');
const eliminarHorariosPorClase = require('../data/HorariosClase/EliminarHorariosPorClase');
const queryObtenerClasesAlumnos = require('../data/Clases/ObtenerClasesAlumnos');

const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { syncEjercicios } = require('./rutinas.controller');

/**
 * Crea o actualiza la rutina vinculada a una clase (categoría, nivel, descripción
 * y ejercicios con video). Si `rutina` viene vacío/ausente no hace nada.
 */
async function guardarRutinaDeClase(idClase, idProfesor, nombreClase, rutina) {
  if (!rutina) return;

  const { categoria, nivel, descripcion, ejercicios } = rutina;
  const tieneContenido = categoria || nivel || descripcion || (Array.isArray(ejercicios) && ejercicios.length > 0);
  if (!tieneContenido) return;

  const [existente] = await db.query('SELECT idRutina FROM rutina WHERE idClase = ?', [idClase]);

  let idRutina;
  if (existente.length > 0) {
    idRutina = existente[0].idRutina;
    await db.query(
      'UPDATE rutina SET nombre = ?, descripcion = ?, nivel = ?, categoria = ?, idProfesor = ? WHERE idRutina = ?',
      [nombreClase, descripcion || null, nivel || null, categoria || null, idProfesor, idRutina]
    );
  } else {
    const [result] = await db.query(
      'INSERT INTO rutina (nombre, descripcion, nivel, categoria, idProfesor, idClase) VALUES (?, ?, ?, ?, ?, ?)',
      [nombreClase, descripcion || null, nivel || null, categoria || null, idProfesor, idClase]
    );
    idRutina = result.insertId;
  }

  await syncEjercicios(idRutina, ejercicios);
}

/**
 * GET /api/clases
 * Obtiene todas las clases agrupadas (Para uso del Panel de Administración)
 */
exports.getAll = asyncHandler(async (req, res) => {
  const [clases] = await db.query(obtenerClases);
  return successResponse(res, 'Clases obtenidas correctamente', clases);
});

/**
 * GET /api/clases/disponibles
 * * Obtiene las clases desglosadas por día/horario individual (Para Reservas de Alumnos)
 */
exports.getClasesDisponibles = asyncHandler(async (req, res) => {
  const [rows] = await db.query(queryObtenerClasesAlumnos);
  return successResponse(res, 'Turnos disponibles obtenidos correctamente', rows);
});

/**
 * GET /api/clases/turnos/resumen
 * Agrupa los turnos realmente usados en horarioclase (no hay tabla maestra de turnos,
 * "turno" es un texto libre por horario) junto con su rango horario real y cuántos
 * horarios de clase lo usan.
 */
exports.getTurnosResumen = asyncHandler(async (req, res) => {
  const [turnos] = await db.query(`
    SELECT
      h.turno AS nombre,
      MIN(h.horaInicio) AS horaInicio,
      MAX(h.horaFin) AS horaFin,
      COUNT(*) AS cantidadHorarios,
      COUNT(DISTINCT h.idClase) AS cantidadClases
    FROM horarioclase h
    WHERE h.turno IS NOT NULL AND h.turno != ''
    GROUP BY h.turno
    ORDER BY horaInicio ASC
  `);

  return successResponse(res, 'Turnos obtenidos correctamente', turnos);
});

/**
 * GET /api/clases/:id
 * Obtiene una clase por ID
 */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [clase] = await db.query(obtenerClasePorId, [id]);

  if (clase.length === 0) {
    return errorResponse(res, 'Clase no encontrada', 404);
  }

  const [rutinaRows] = await db.query('SELECT * FROM rutina WHERE idClase = ?', [id]);
  let rutina = null;

  if (rutinaRows.length > 0) {
    const [ejercicios] = await db.query(
      'SELECT idEjercicio, nombre, videoUrl, orden FROM ejercicio WHERE idRutina = ? ORDER BY orden ASC',
      [rutinaRows[0].idRutina]
    );
    rutina = { ...rutinaRows[0], ejercicios };
  }

  return successResponse(res, 'Clase obtuvo correctamente', { ...clase[0], rutina });
});

/**
 * POST /api/clases
 * Crea una nueva clase en diaclase salteándose la tabla gimnasio
 */
exports.insert = asyncHandler(async (req, res) => {
  const {
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idProfesor,
    idPlan,
    diasSemana,
    horaInicio,
    horaFin,
    turno,
    rutina
  } = req.body;

  if (!nombreClase || !tipoClase || !cupoMaximo || !cupoDisponible || !estado || !idProfesor) {
    return errorResponse(res, 'Todos los campos de la clase son obligatorios', 400);
  }

  if (!diasSemana || !Array.isArray(diasSemana) || diasSemana.length === 0) {
    return errorResponse(res, 'Debe seleccionar al menos un día para la clase', 400);
  }

  if (!horaInicio || !horaFin || !turno) {
    return errorResponse(res, 'Horario, hora de inicio, hora de fin y turno son obligatorios', 400);
  }

  const [result] = await db.query(insertarClase, [
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    null,
    idProfesor,
    idPlan || null
  ]);

  const idClase = result.insertId;

  for (const dia of diasSemana) {
    await db.query(insertarHorarioClase, [
      dia,
      horaInicio,
      horaFin,
      turno,
      idClase
    ]);
  }

  await guardarRutinaDeClase(idClase, idProfesor, nombreClase, rutina);

  return successResponse(res, 'Clase creada correctamente con sus horarios', {
    idClase,
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio: null,
    idProfesor,
    horarios: diasSemana.map((dia) => ({
      dia,
      horaInicio,
      horaFin,
      turno
    }))
  }, 201);
});

/**
 * PUT /api/clases/:id
 * Actualiza una clase existente forzando NULL en el gimnasio
 */
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idProfesor,
    idPlan,
    diasSemana,
    horaInicio,
    horaFin,
    turno,
    rutina
  } = req.body;

  if (!nombreClase || !tipoClase || !cupoMaximo || !cupoDisponible || !estado || !idProfesor) {
    return errorResponse(res, 'Todos los campos de la clase son obligatorios', 400);
  }

  if (!diasSemana || !Array.isArray(diasSemana) || diasSemana.length === 0) {
    return errorResponse(res, 'Debe seleccionar al menos un día para la clase', 400);
  }

  if (!horaInicio || !horaFin || !turno) {
    return errorResponse(res, 'Horario, hora de inicio, hora de fin y turno son obligatorios', 400);
  }

  const [claseExistente] = await db.query(obtenerClasePorId, [id]);

  if (claseExistente.length === 0) {
    return errorResponse(res, 'Clase no encontrada', 404);
  }

  await db.query(actualizarClase, [
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    null,
    idProfesor,
    idPlan || null,
    id
  ]);

  await db.query(eliminarHorariosPorClase, [id]);

  for (const dia of diasSemana) {
    await db.query(insertarHorarioClase, [
      dia,
      horaInicio,
      horaFin,
      turno,
      id
    ]);
  }

  await guardarRutinaDeClase(id, idProfesor, nombreClase, rutina);

  return successResponse(res, 'Clase actualizada correctamente', {
    idClase: Number(id),
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio: null,
    idProfesor,
    horarios: diasSemana.map((dia) => ({
      dia,
      horaInicio,
      horaFin,
      turno
    }))
  });
});

/**
 * PATCH /api/clases/:id/estado
 * Cambia solamente el estado de una clase
 */
exports.updateEstado = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!estado) {
    return errorResponse(res, 'El estado es obligatorio', 400);
  }

  const [claseExistente] = await db.query(obtenerClasePorId, [id]);

  if (claseExistente.length === 0) {
    return errorResponse(res, 'Clase no encontrada', 404);
  }

  await db.query(actualizarEstadoClase, [estado, id]);

  return successResponse(res, 'Estado de la clase actualizado correctamente', {
    idClase: Number(id),
    estado
  });
});

/**
 * DELETE /api/clases/:id
 * Elimina una clase y sus horarios asociados
 */
exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [claseExistente] = await db.query(obtenerClasePorId, [id]);

  if (claseExistente.length === 0) {
    return errorResponse(res, 'Clase no encontrada', 404);
  }

  await db.query(eliminarHorariosPorClase, [id]);
  await db.query(eliminarClase, [id]);

  return successResponse(res, 'Clase eliminada correctamente');
});

// EXPORTS SEGUROS Y UNIFICADOS
module.exports = {
  getAll: exports.getAll,
  getClasesDisponibles: exports.getClasesDisponibles, // 🟢 Ahora sí exportado correctamente
  getTurnosResumen: exports.getTurnosResumen,
  getById: exports.getById,
  insert: exports.insert,
  update: exports.update,
  updateEstado: exports.updateEstado,
  delete: exports.delete
};