const db = require('../config/db');
const obtenerPermisoPerfilModulo = require('../data/Perfil/ObtenerPermisoPerfilModulo');
const { errorResponse } = require('../utils/response');

const PERMISSION_COLUMNS = {
  alta: 'permiso_alta',
  baja: 'permiso_baja',
  modificacion: 'permiso_modificacion',
  consulta: 'permiso_consulta',
};

function hasBootstrapAccess(req) {
  return req.user && req.user.idPerfil === 1;
}

function requirePermission(moduloNombre, accion) {
  const permissionColumn = PERMISSION_COLUMNS[accion];

  if (!permissionColumn) {
    throw new Error(`Acción de permiso no válida: ${accion}`);
  }

  return async (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'No autenticado', 'NOT_AUTHENTICATED', 401);
    }

    if (hasBootstrapAccess(req)) {
      return next();
    }

    const [permisos] = await db.query(obtenerPermisoPerfilModulo, [req.user.idPerfil, moduloNombre]);

    if (permisos.length === 0 || !permisos[0][permissionColumn]) {
      return errorResponse(res, 'Acceso denegado por permisos insuficientes', 'FORBIDDEN', 403);
    }

    next();
  };
}

function allowSelfOrPermission(moduloNombre, accion) {
  const permissionMiddleware = requirePermission(moduloNombre, accion);

  return async (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'No autenticado', 'NOT_AUTHENTICATED', 401);
    }

    const userId = Number(req.params.id);
    if (req.user.idUsuario === userId) {
      return next();
    }

    return permissionMiddleware(req, res, next);
  };
}

module.exports = {
  requirePermission,
  allowSelfOrPermission,
};