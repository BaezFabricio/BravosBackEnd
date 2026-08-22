const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

const TIPOS_VALIDOS = ['ClaseCross', 'PlanificacionAtleta'];

/**
 * GET /planes
 */
exports.getAll = asyncHandler(async (req, res) => {
  const [planes] = await db.query('SELECT * FROM plan ORDER BY idPlan');
  return successResponse(res, 'Planes obtenidos correctamente', planes);
});

/**
 * GET /planes/:id
 */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [planes] = await db.query('SELECT * FROM plan WHERE idPlan = ?', [id]);

  if (planes.length === 0) {
    return errorResponse(res, 'Plan no encontrado', 'NOT_FOUND', 404);
  }

  return successResponse(res, 'Plan obtenido correctamente', planes[0]);
});

/**
 * POST /planes
 */
exports.insert = asyncHandler(async (req, res) => {
  const { nombre, descripcion, precio, cantidadCreditos, tipo } = req.body;

  if (!nombre || precio === undefined || cantidadCreditos === undefined) {
    return errorResponse(res, 'Nombre, precio y cantidad de créditos son obligatorios.', 'MISSING_FIELDS', 400);
  }

  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return errorResponse(res, `El tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}`, 'INVALID_TIPO', 400);
  }

  const [result] = await db.query(
    'INSERT INTO plan (nombre, descripcion, precio, cantidadCreditos, tipo) VALUES (?, ?, ?, ?, ?)',
    [nombre, descripcion || null, precio, cantidadCreditos, tipo || TIPOS_VALIDOS[0]]
  );

  return successResponse(res, 'Plan creado correctamente', {
    idPlan: result.insertId, nombre, descripcion, precio, cantidadCreditos, tipo
  }, 201);
});

/**
 * PUT /planes/:id
 */
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, precio, cantidadCreditos, tipo } = req.body;

  if (!nombre || precio === undefined || cantidadCreditos === undefined) {
    return errorResponse(res, 'Nombre, precio y cantidad de créditos son obligatorios.', 'MISSING_FIELDS', 400);
  }

  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return errorResponse(res, `El tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}`, 'INVALID_TIPO', 400);
  }

  const [planExistente] = await db.query('SELECT idPlan FROM plan WHERE idPlan = ?', [id]);

  if (planExistente.length === 0) {
    return errorResponse(res, 'Plan no encontrado', 'NOT_FOUND', 404);
  }

  await db.query(
    'UPDATE plan SET nombre = ?, descripcion = ?, precio = ?, cantidadCreditos = ?, tipo = ? WHERE idPlan = ?',
    [nombre, descripcion || null, precio, cantidadCreditos, tipo || TIPOS_VALIDOS[0], id]
  );

  return successResponse(res, 'Plan actualizado correctamente', {
    idPlan: Number(id), nombre, descripcion, precio, cantidadCreditos, tipo
  });
});

/**
 * DELETE /planes/:id
 * No se permite borrar un plan que ya tiene pagos asociados (rompería el historial),
 * en ese caso solo se puede editar su precio/nombre.
 */
exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [planExistente] = await db.query('SELECT idPlan FROM plan WHERE idPlan = ?', [id]);

  if (planExistente.length === 0) {
    return errorResponse(res, 'Plan no encontrado', 'NOT_FOUND', 404);
  }

  const [pagosAsociados] = await db.query('SELECT COUNT(*) AS total FROM pago WHERE idPlan = ?', [id]);

  if (pagosAsociados[0].total > 0) {
    return errorResponse(
      res,
      'No se puede eliminar un plan que ya tiene pagos registrados. Podés editarlo en su lugar.',
      'PLAN_IN_USE',
      400
    );
  }

  await db.query('DELETE FROM plan WHERE idPlan = ?', [id]);

  return successResponse(res, 'Plan eliminado correctamente');
});
