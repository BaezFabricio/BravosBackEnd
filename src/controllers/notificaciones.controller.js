const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * GET /notificaciones
 * Devuelve las notificaciones del usuario autenticado (máx 50, más recientes primero).
 */
exports.getMias = asyncHandler(async (req, res) => {
  const idUsuario = req.user.idUsuario;

  const [rows] = await db.query(
    `SELECT idNotificacion, tipo, titulo, mensaje, link, leida, creadoEn
     FROM notificacion
     WHERE idUsuario = ?
     ORDER BY creadoEn DESC
     LIMIT 50`,
    [idUsuario]
  );

  const noLeidas = rows.filter(n => !n.leida).length;

  return successResponse(res, 'Notificaciones obtenidas', { notificaciones: rows, noLeidas });
});

/**
 * PATCH /notificaciones/:id/leer
 * Marca una notificación como leída.
 */
exports.marcarLeida = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const idUsuario = req.user.idUsuario;

  await db.query(
    'UPDATE notificacion SET leida = 1 WHERE idNotificacion = ? AND idUsuario = ?',
    [id, idUsuario]
  );

  return successResponse(res, 'Notificación marcada como leída');
});

/**
 * PATCH /notificaciones/leer-todas
 * Marca todas las notificaciones del usuario como leídas.
 */
exports.marcarTodasLeidas = asyncHandler(async (req, res) => {
  const idUsuario = req.user.idUsuario;

  await db.query(
    'UPDATE notificacion SET leida = 1 WHERE idUsuario = ? AND leida = 0',
    [idUsuario]
  );

  return successResponse(res, 'Todas las notificaciones marcadas como leídas');
});
