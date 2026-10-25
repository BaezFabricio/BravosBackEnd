const { errorResponse } = require('../utils/response');
const Logger = require('../utils/logger');

const logger = new Logger('ErrorMiddleware');

/**
 * Middleware para manejar errores
 */
function errorHandler(err, req, res, next) {
  logger.error('Error capturado:', err);

  // Errores de subida de archivos: son del pedido (archivo muy grande o de un tipo no permitido), no del servidor
  if (err.name === 'MulterError') {
    const grande = err.code === 'LIMIT_FILE_SIZE';
    return errorResponse(res, grande ? 'El archivo es demasiado grande.' : 'No se pudo recibir el archivo.', grande ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR', grande ? 413 : 400);
  }
  if (typeof err.message === 'string' && /^Solo se permiten (imágenes|videos)/.test(err.message)) {
    return errorResponse(res, err.message, 'INVALID_FILE_TYPE', 400);
  }

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
