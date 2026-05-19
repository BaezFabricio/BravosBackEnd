const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

/**
 * Respuesta exitosa estándar
 */
function successResponse(res, message, data = null, statusCode = HTTP_STATUS.OK) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

/**
 * Respuesta de error estándar
 */
function errorResponse(res, message, errorCode = null, statusCode = HTTP_STATUS.INTERNAL_ERROR) {
  return res.status(statusCode).json({
    success: false,
    message,
    errorCode,
  });
}

/**
 * Respuesta paginada
 */
function paginatedResponse(res, data, total, page, limit, message = 'Datos obtenidos correctamente') {
  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message,
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
}

module.exports = {
  HTTP_STATUS,
  successResponse,
  errorResponse,
  paginatedResponse,
};
