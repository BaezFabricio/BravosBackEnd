const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { obtenerReglas, validarReglas, guardarReglas, LIMITES, POR_DEFECTO } = require('../functions/reglasBox');

/** GET /reglas-box — las reglas actuales y sus límites (requiere configuración: consulta) */
exports.obtener = asyncHandler(async (req, res) => {
  const reglas = await obtenerReglas();
  return successResponse(res, 'Reglas del box', { ...reglas, limites: LIMITES, porDefecto: POR_DEFECTO });
});

/** PUT /reglas-box — cambia las reglas (requiere configuración: modificación). Todo se valida acá, nunca en el navegador. */
exports.actualizar = asyncHandler(async (req, res) => {
  const { reglas, error } = validarReglas(req.body);
  if (error) return errorResponse(res, error, 'VALIDATION_ERROR', 400);
  const guardadas = await guardarReglas(reglas);
  return successResponse(res, 'Reglas guardadas', guardadas);
});
