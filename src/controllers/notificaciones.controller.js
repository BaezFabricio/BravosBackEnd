const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { registrarAccion } = require('../functions/notificacion.service');

/**
 * GET /notificaciones
 * Devuelve las notificaciones del usuario autenticado (máx 50, más recientes primero).
 */
exports.getMias = asyncHandler(async (req, res) => {
  // Este endpoint se consulta por polling cada 30s; sin esto el navegador
  // puede servir una respuesta vieja cacheada (visible como 304 en Network)
  // en vez de ir a buscar notificaciones nuevas al servidor.
  res.set('Cache-Control', 'no-store')

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

/**
 * DELETE /notificaciones
 * Vacía la bandeja del usuario autenticado: borra solo sus propias notificaciones (el usuario sale del token).
 */
exports.limpiarMias = asyncHandler(async (req, res) => {
  const idUsuario = req.user.idUsuario;

  await db.query('DELETE FROM notificacion WHERE idUsuario = ?', [idUsuario]);

  return successResponse(res, 'Bandeja de notificaciones vacía');
});

// Solo estos tipos pueden registrarse desde la pantalla: los del sistema (reserva, credito…) los crea únicamente el servidor
const TIPOS_DE_ACCION = ['exito', 'error', 'advertencia', 'info'];

/**
 * POST /notificaciones/registro
 * Guarda en el historial del propio usuario un aviso de acción (el usuario sale del token, nunca del cuerpo).
 */
exports.registrarAccion = asyncHandler(async (req, res) => {
  const { tipo, titulo, mensaje } = req.body || {};
  const limpiar = (v, max) => [...String(v ?? '')].map(c => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').trim().slice(0, max);

  if (!TIPOS_DE_ACCION.includes(tipo)) return errorResponse(res, 'Tipo de aviso no válido', null, 400);
  const t = limpiar(titulo, 150);
  const m = limpiar(mensaje, 500);
  if (!t || !m) return errorResponse(res, 'El aviso necesita título y mensaje', null, 400);

  await registrarAccion(req.user.idUsuario, tipo, t, m);
  return successResponse(res, 'Aviso registrado');
});
