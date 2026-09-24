const { extractToken, verifyToken } = require('../functions/jwt');
const { errorResponse } = require('../utils/response');
const { NOMBRE_COOKIE, leerCookie } = require('../functions/sesionCookie');
const { corsOptions } = require('../config/cors');
const envConfig = require('../config/env');

const METODOS_SEGUROS = ['GET', 'HEAD', 'OPTIONS'];
const PATRON_DEV = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$/;
const origenPermitido = (origin) =>
  corsOptions.origin.includes(origin) || (envConfig.nodeEnv !== 'production' && PATRON_DEV.test(origin));

/**
 * Middleware para verificar autenticación (JWT)
 */
function authenticateToken(req, res, next) {
  // La sesión normal viaja en una cookie httpOnly; el encabezado Bearer queda para clientes que no son el navegador.
  const cookieToken = leerCookie(req.headers, NOMBRE_COOKIE);
  const token = cookieToken || extractToken(req.headers);

  // Con cookie, el navegador la manda sola: para que otro sitio no pueda usarla (CSRF) los pedidos que
  // modifican datos solo se aceptan si vienen del propio sistema.
  if (cookieToken && !METODOS_SEGUROS.includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && !origenPermitido(origin)) {
      return errorResponse(res, 'Origen no permitido', 'BAD_ORIGIN', 403);
    }
  }

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
