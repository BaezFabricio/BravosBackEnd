const { errorResponse } = require('../utils/response');
const Logger = require('../utils/logger');

const logger = new Logger('ErrorMiddleware');

/**
 * Middleware para manejar errores
 */
function errorHandler(err, req, res, next) {
  logger.error('Error capturado:', err);

  // Error de validación de BD (duplicado, etc)
  if (err.code === 'ER_DUP_ENTRY') {
    return errorResponse(res, 'Registro duplicado', 'DUPLICATE_ENTRY', 409);
  }

  // Error de foreign key
  if (err.code === 'ER_NO_REFERENCED_ROW') {
    return errorResponse(res, 'Referencia inválida', 'INVALID_REFERENCE', 400);
  }

  // Error de BD general
  if (err.code && err.code.startsWith('ER_')) {
    return errorResponse(res, 'Error en la base de datos', 'DATABASE_ERROR', 500);
  }

  // Error personalizado
  if (err.statusCode) {
    return errorResponse(res, err.message, err.code, err.statusCode);
  }

  // Error genérico
  return errorResponse(res, 'Error interno del servidor', 'INTERNAL_ERROR', 500);
}

/**
 * Middleware para rutas no encontradas (404)
 */
function notFoundHandler(req, res) {
  return errorResponse(res, 'Ruta no encontrada', 'NOT_FOUND', 404);
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
