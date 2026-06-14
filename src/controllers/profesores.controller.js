const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse } = require('../utils/response');
const obtenerProfesoresActivos = require('../data/Profesores/ObtenerProfesoresActivos');

/**
 * GET /api/vv1/profesores
 * Obtiene la lista de profesores filtrados dinámicamente por sus permisos de perfil
 */
exports.getAll = asyncHandler(async (req, res) => {
  const [profesores] = await db.query(obtenerProfesoresActivos);
  return successResponse(res, 'Profesores activos recuperados correctamente', profesores);
});