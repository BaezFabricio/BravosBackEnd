const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

const TIPOS_VALIDOS = ['ClaseCross', 'PlanificacionAtleta'];

/**
 * GET /planes
 */
exports.getAll = asyncHandler(async (req, res) => {
  // Además de los datos del plan, cuántos alumnos lo tienen activo hoy (crédito activo y sin vencer).
  // Solo cantidades, nunca quiénes: esta ruta exige el permiso de Membresías.
  const [planes] = await db.query(`
    SELECT pl.idPlan, pl.nombre, pl.descripcion, pl.precio, pl.cantidadCreditos, pl.tipo,
           (SELECT COUNT(DISTINCT c.idAlumno)
              FROM credito c
              INNER JOIN pago p ON c.idPago = p.idPago
             WHERE p.idPlan = pl.idPlan AND c.estado = 'ACTIVO' AND c.fechaVencimiento >= CURDATE()) AS alumnosActivos
      FROM plan pl
     ORDER BY pl.idPlan`);
  return successResponse(res, 'Planes obtenidos correctamente', planes.map((p) => ({ ...p, alumnosActivos: Number(p.alumnosActivos) || 0 })));
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
// Validación del lado del servidor: el precio es dinero y no se acepta lo que mande el navegador sin revisar
function problemaDelPlan({ nombre, descripcion, precio, cantidadCreditos }) {
  if (!nombre || !String(nombre).trim()) return 'El nombre es obligatorio.';
  if (String(nombre).length > 100) return 'El nombre puede tener hasta 100 caracteres.';
  const p = Number(precio);
  if (!Number.isFinite(p) || p <= 0) return 'El precio tiene que ser un número mayor a 0.';
  if (p > 10000000) return 'El precio es demasiado alto.';
  const c = Number(cantidadCreditos);
  if (!Number.isInteger(c) || c < 1 || c > 1000) return 'Los créditos tienen que ser un número entero entre 1 y 1000.';
  if (descripcion && String(descripcion).length > 1000) return 'La descripción y las condiciones pueden tener hasta 1000 caracteres.';
  return null;
}

exports.insert = asyncHandler(async (req, res) => {
  const { nombre, descripcion, precio, cantidadCreditos, tipo } = req.body;

  const problema = problemaDelPlan({ nombre, descripcion, precio, cantidadCreditos });
  if (problema) return errorResponse(res, problema, 'INVALID_PLAN', 400);

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

  const problema = problemaDelPlan({ nombre, descripcion, precio, cantidadCreditos });
  if (problema) return errorResponse(res, problema, 'INVALID_PLAN', 400);

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
