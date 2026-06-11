const db = require('../config/db');

const obtenerClases = require('../data/Clases/ObtenerClases');
const obtenerClasePorId = require('../data/Clases/ObtenerClasePorId');
const insertarClase = require('../data/Clases/InsertarClase');
const actualizarClase = require('../data/Clases/ActualizarClase');
const actualizarEstadoClase = require('../data/Clases/ActualizarEstadoClase');
const eliminarClase = require('../data/Clases/EliminarClase');

const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * GET /api/clases
 * Obtiene todas las clases
 */
exports.getAll = asyncHandler(async (req, res) => {
  const [clases] = await db.query(obtenerClases);

  return successResponse(res, 'Clases obtenidas correctamente', clases);
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

  return successResponse(res, 'Clase obtenida correctamente', clase[0]);
});

/**
 * POST /api/clases
 * Crea una nueva clase
 */
exports.insert = asyncHandler(async (req, res) => {
  const {
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio,
    idProfesor
  } = req.body;

  if (!nombreClase || !tipoClase || !cupoMaximo || !cupoDisponible || !estado || !idGimnasio || !idProfesor) {
    return errorResponse(res, 'Todos los campos son obligatorios', 400);
  }

  const [result] = await db.query(insertarClase, [
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio,
    idProfesor
  ]);

  return successResponse(res, 'Clase creada correctamente', {
    idClase: result.insertId,
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio,
    idProfesor
  }, 201);
});

/**
 * PUT /api/clases/:id
 * Actualiza una clase existente
 */
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const {
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio,
    idProfesor
  } = req.body;

  if (!nombreClase || !tipoClase || !cupoMaximo || !cupoDisponible || !estado || !idGimnasio || !idProfesor) {
    return errorResponse(res, 'Todos los campos son obligatorios', 400);
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
    idGimnasio,
    idProfesor,
    id
  ]);

  return successResponse(res, 'Clase actualizada correctamente', {
    idClase: Number(id),
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio,
    idProfesor
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
 * Elimina una clase
 */
exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [claseExistente] = await db.query(obtenerClasePorId, [id]);

  if (claseExistente.length === 0) {
    return errorResponse(res, 'Clase no encontrada', 404);
  }

  await db.query(eliminarClase, [id]);

  return successResponse(res, 'Clase eliminada correctamente');
});