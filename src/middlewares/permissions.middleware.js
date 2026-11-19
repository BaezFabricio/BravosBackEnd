const db = require('../config/db');
const { errorResponse } = require('../utils/response');
const { esSuperAdmin, aLista } = require('../functions/escalada');

// Consulta: ¿alguno de estos perfiles tiene el permiso módulo:acción?
const SQL_TIENE_PERMISO = `
  SELECT p.idPermiso
  FROM perfilpermiso pp
  INNER JOIN permiso p ON pp.idPermiso = p.idPermiso
  WHERE pp.idPerfil IN (?)
    AND LOWER(p.modulo) = LOWER(?)
    AND LOWER(p.accion) = LOWER(?)
  LIMIT 1
`;

function hasBootstrapAccess(req) {
  // El perfil 1 sigue siendo el Admin General con pase libre absoluto (si lo tiene entre sus perfiles)
  return Boolean(req.user) && esSuperAdmin(req.user.perfiles);
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
      // Vale si alguno de los perfiles del usuario tiene el permiso (son acumulables)
      if (!(await tienePermiso(req.user.perfiles, moduloNombre, accion))) {
        return errorResponse(res, 'Acceso denegado por permisos insuficientes', 'FORBIDDEN', 403);
      }

      next();
    } catch (error) {
      console.error('Error en middleware de permisos:', error);
      return errorResponse(res, 'Error interno al validar permisos', 'INTERNAL_SERVER_ERROR', 500);
    }
  };
}

/**
 * ¿Alguno de estos perfiles (un número o una lista) tiene el permiso módulo:acción? (mismo criterio que requirePermission)
 */
async function tienePermiso(perfiles, moduloNombre, accion) {
  const ids = aLista(perfiles);
  if (ids.length === 0) return false;
  const [permisos] = await db.query(SQL_TIENE_PERMISO, [ids, moduloNombre, accion]);
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
        if (await tienePermiso(req.user.perfiles, modulo, accion)) return next();
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