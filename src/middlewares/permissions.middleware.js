const db = require('../config/db');
const obtenerPermisoPerfilModulo = require('../data/Perfil/ObtenerPermisoPerfilModulo');
const { errorResponse } = require('../utils/response');

function hasBootstrapAccess(req) {
  // El ID 1 sigue siendo el Admin General con pase libre absoluto
  return req.user && Number(req.user.idPerfil) === 1;
}

function requirePermission(moduloNombre, accion) {
  return async (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'No autenticado', 'NOT_AUTHENTICATED', 401);
    }

    if (hasBootstrapAccess(req)) {
      return next();
    }

    try {
      const perfilIdActual = req.user.idPerfil;

      // Ejecutamos la nueva query pasando los 3 parámetros clave
      const [permisos] = await db.query(obtenerPermisoPerfilModulo, [perfilIdActual, moduloNombre, accion]);

      // Si no se encontró ninguna fila, es porque no tiene ese permiso asignado
      if (permisos.length === 0) {
        return errorResponse(res, 'Acceso denegado por permisos insuficientes', 'FORBIDDEN', 403);
      }

      // Si existe el registro, le damos luz verde
      next();
    } catch (error) {
      console.error('Error en middleware de permisos:', error);
      return errorResponse(res, 'Error interno al validar permisos', 'INTERNAL_SERVER_ERROR', 500);
    }
  };
}

function allowSelfOrPermission(moduloNombre, accion) {
  const permissionMiddleware = requirePermission(moduloNombre, accion);

  return async (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'No autenticado', 'NOT_AUTHENTICATED', 401);
    }

    const userId = Number(req.params.id);
    if (Number(req.user.idUsuario || req.user.id) === userId) {
      return next();
    }

    return permissionMiddleware(req, res, next);
  };
}

module.exports = {
  requirePermission,
  allowSelfOrPermission,
};