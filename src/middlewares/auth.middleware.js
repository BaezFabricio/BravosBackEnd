const { extractToken, verifyToken } = require('../functions/jwt');
const { errorResponse } = require('../utils/response');

/**
 * Middleware para verificar autenticación (JWT)
 */
function authenticateToken(req, res, next) {
  const token = extractToken(req.headers);

  if (!token) {
    return errorResponse(res, 'Token ausente. Por favor proporciona un token válido', 'NO_TOKEN', 401);
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return errorResponse(res, error.message, 'INVALID_TOKEN', 401);
  }
}

/**
 * Middleware para verificar si el usuario es administrador
 */
function isAdmin(req, res, next) {
  if (!req.user) {
    return errorResponse(res, 'No autenticado', 'NOT_AUTHENTICATED', 401);
  }

  // 1 = Administrador (según BD)
  if (req.user.idPerfil !== 1) {
    return errorResponse(res, 'Acceso denegado. Se requieren permisos de administrador', 'FORBIDDEN', 403);
  }

  next();
}

/**
 * Middleware para verificar si el usuario puede acceder a su propio perfil o es admin
 */
function ownProfileOrAdmin(req, res, next) {
  if (!req.user) {
    return errorResponse(res, 'No autenticado', 'NOT_AUTHENTICATED', 401);
  }

  const userId = parseInt(req.params.id);
  const isAdminUser = req.user.idPerfil === 1;

  if (req.user.idUsuario !== userId && !isAdminUser) {
    return errorResponse(res, 'Acceso denegado. Solo puedes acceder a tu propio perfil', 'FORBIDDEN', 403);
  }

  next();
}

module.exports = {
  authenticateToken,
  isAdmin,
  ownProfileOrAdmin,
};
