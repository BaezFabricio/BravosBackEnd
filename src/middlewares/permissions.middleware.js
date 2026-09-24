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

/**
 * ¿Este perfil tiene el permiso módulo:acción? (mismo criterio que requirePermission)
 */
async function tienePermiso(idPerfil, moduloNombre, accion) {
  if (!idPerfil) return false;
  const [permisos] = await db.query(obtenerPermisoPerfilModulo, [idPerfil, moduloNombre, accion]);
  return permisos.length > 0;
}

/**
 * Deja pasar si el perfil tiene AL MENOS UNO de los permisos [[modulo, accion], ...].
 * Sirve para rutas que usan dos tipos de perfil (por ejemplo alumno y administrador).
 */
function requireAnyPermission(pares) {
  return async (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'No autenticado', 'NOT_AUTHENTICATED', 401);
    }

    try {
      for (const [modulo, accion] of pares) {
        if (await tienePermiso(req.user.idPerfil, modulo, accion)) return next();
      }
      return errorResponse(res, 'Acceso denegado por permisos insuficientes', 'FORBIDDEN', 403);
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

// Cada control de permiso queda marcado para que scripts/auditar-rutas.js pueda comprobar
// automáticamente que ninguna ruta se olvidó de exigir permisos.
const marcar = (fabrica) => (...args) => {
  const middleware = fabrica(...args);
  middleware.esControlDePermiso = true;
  return middleware;
};

module.exports = {
  requirePermission: marcar(requirePermission),
  requireAnyPermission: marcar(requireAnyPermission),
  allowSelfOrPermission: marcar(allowSelfOrPermission),
  tienePermiso,
};