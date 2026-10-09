const db = require('../config/db');
const { errorResponse } = require('../utils/response');
const { tienePermiso } = require('./permissions.middleware');

/**
 * Los archivos de /uploads/documentos (comprobantes, certificados médicos, declaraciones juradas)
 * no son públicos: solo los ve su dueño o quien tiene permiso de consultar usuarios.
 * Va después de authenticateToken. Los enlaces del frontend son del mismo sitio, así que la
 * cookie de sesión viaja sola al abrirlos.
 */
async function soloDuenoOAdministrador(req, res, next) {
  try {
    const archivo = decodeURIComponent(req.path.split('?')[0]).replace(/^\/+/, '');
    if (!archivo || archivo.includes('/') || archivo.includes('..')) {
      return errorResponse(res, 'Archivo no encontrado', 'NOT_FOUND', 404);
    }

    const [rows] = await db.query(
      `SELECT d.idPersona, u.idUsuario AS idDueno
       FROM documento_alumno d
       LEFT JOIN usuario u ON u.idPersona = d.idPersona
       WHERE d.urlArchivo = ?
       LIMIT 1`,
      [`/uploads/documentos/${archivo}`]
    );
    if (rows.length === 0) return errorResponse(res, 'Archivo no encontrado', 'NOT_FOUND', 404);

    const esDueno = Number(rows[0].idDueno) === Number(req.user.idUsuario);
    const esAdmin = Number(req.user.idPerfil) === 1 || (await tienePermiso(req.user.idPerfil, 'Usuarios', 'consulta'));
    if (!esDueno && !esAdmin) {
      return errorResponse(res, 'No tenés permiso para ver este documento', 'FORBIDDEN', 403);
    }
    // Que el navegador no lo guarde en cachés compartidas
    res.set('Cache-Control', 'private, no-store');
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { soloDuenoOAdministrador };
