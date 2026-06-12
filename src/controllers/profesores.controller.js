const db = require('../config/db');
const obtenerProfesores = require('../data/Profesores/ObtenerProfesores');

const { asyncHandler } = require('../utils/helpers');
const { successResponse } = require('../utils/response');

/**
 * GET /api/profesores
 * Obtiene todos los profesores
 */
exports.getAll = asyncHandler(async (req, res) => {
  const [profesores] = await db.query(obtenerProfesores);

  return successResponse(res, 'Profesores obtenidos correctamente', profesores);
});