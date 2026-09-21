const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * GET /ejercicios/:idEjercicio/variantes
 * Lista las variantes de un ejercicio (accesible por alumno, profesor y admin)
 */
exports.getByEjercicio = asyncHandler(async (req, res) => {
  const { idEjercicio } = req.params;

  const [variantes] = await db.query(
    'SELECT idVariante, nombre, descripcion, videoUrl, limitacion FROM variante WHERE idEjercicio = ? ORDER BY idVariante ASC',
    [idEjercicio]
  );

  return successResponse(res, 'Variantes obtenidas correctamente', variantes);
});

/**
 * POST /ejercicios/:idEjercicio/variantes
 * Crea una variante para un ejercicio (admin o profesor)
 */
exports.create = asyncHandler(async (req, res) => {
  const { idEjercicio } = req.params;
  const { nombre, descripcion, videoUrl, limitacion } = req.body;

  if (!nombre?.trim()) {
    return errorResponse(res, 'El nombre de la variante es obligatorio.', 'MISSING_FIELDS', 400);
  }

  const [ejRows] = await db.query('SELECT idEjercicio FROM ejercicio WHERE idEjercicio = ?', [idEjercicio]);
  if (ejRows.length === 0) {
    return errorResponse(res, 'Ejercicio no encontrado.', 'NOT_FOUND', 404);
  }

  const [result] = await db.query(
    'INSERT INTO variante (idEjercicio, nombre, descripcion, videoUrl, limitacion) VALUES (?, ?, ?, ?, ?)',
    [idEjercicio, nombre.trim(), descripcion || null, videoUrl || null, limitacion || null]
  );

  return successResponse(res, 'Variante creada correctamente', {
    idVariante: result.insertId,
    idEjercicio: Number(idEjercicio),
    nombre: nombre.trim(),
    descripcion: descripcion || null,
    videoUrl: videoUrl || null,
    limitacion: limitacion || null,
  }, 201);
});

/**
 * PUT /ejercicios/:idEjercicio/variantes/:idVariante
 * Actualiza una variante (admin o profesor)
 */
exports.update = asyncHandler(async (req, res) => {
  const { idEjercicio, idVariante } = req.params;
  const { nombre, descripcion, videoUrl, limitacion } = req.body;

  if (!nombre?.trim()) {
    return errorResponse(res, 'El nombre de la variante es obligatorio.', 'MISSING_FIELDS', 400);
  }

  const [rows] = await db.query(
    'SELECT idVariante FROM variante WHERE idVariante = ? AND idEjercicio = ?',
    [idVariante, idEjercicio]
  );
  if (rows.length === 0) {
    return errorResponse(res, 'Variante no encontrada.', 'NOT_FOUND', 404);
  }

  await db.query(
    'UPDATE variante SET nombre = ?, descripcion = ?, videoUrl = ?, limitacion = ? WHERE idVariante = ?',
    [nombre.trim(), descripcion || null, videoUrl || null, limitacion || null, idVariante]
  );

  return successResponse(res, 'Variante actualizada correctamente', {
    idVariante: Number(idVariante),
    idEjercicio: Number(idEjercicio),
    nombre: nombre.trim(),
    descripcion: descripcion || null,
    videoUrl: videoUrl || null,
    limitacion: limitacion || null,
  });
});

/**
 * DELETE /ejercicios/:idEjercicio/variantes/:idVariante
 * Elimina una variante (admin o profesor)
 */
exports.remove = asyncHandler(async (req, res) => {
  const { idEjercicio, idVariante } = req.params;

  const [rows] = await db.query(
    'SELECT idVariante FROM variante WHERE idVariante = ? AND idEjercicio = ?',
    [idVariante, idEjercicio]
  );
  if (rows.length === 0) {
    return errorResponse(res, 'Variante no encontrada.', 'NOT_FOUND', 404);
  }

  await db.query('DELETE FROM variante WHERE idVariante = ?', [idVariante]);

  return successResponse(res, 'Variante eliminada correctamente');
});
