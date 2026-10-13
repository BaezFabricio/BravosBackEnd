const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { pushActivo, clavePublica, guardarSuscripcion, borrarSuscripcion } = require('../functions/push.service');

/*
 * Notificaciones push del propio dispositivo. Solo piden sesión (no un permiso): cada persona
 * activa o desactiva las notificaciones de SU dispositivo, y el usuario sale siempre del token,
 * nunca de lo que manda el navegador.
 */

// Clave pública VAPID que el navegador necesita para suscribirse (es pública por diseño)
router.get('/clave-publica', authenticateToken, (req, res) => {
  if (!pushActivo) return errorResponse(res, 'Las notificaciones push no están configuradas en el servidor.', 'PUSH_DESACTIVADO', 503);
  return successResponse(res, 'Clave pública', { clave: clavePublica() });
});

// Activar en este dispositivo
router.post('/suscripcion', authenticateToken, asyncHandler(async (req, res) => {
  if (!pushActivo) return errorResponse(res, 'Las notificaciones push no están configuradas en el servidor.', 'PUSH_DESACTIVADO', 503);
  const problema = await guardarSuscripcion(req.user.idUsuario, req.body);
  if (problema) return errorResponse(res, problema, 'VALIDATION_ERROR', 400);
  return successResponse(res, 'Notificaciones activadas en este dispositivo');
}));

// Desactivar en este dispositivo (también se llama al cerrar sesión)
router.delete('/suscripcion', authenticateToken, asyncHandler(async (req, res) => {
  await borrarSuscripcion(req.user.idUsuario, req.body?.endpoint);
  return successResponse(res, 'Notificaciones desactivadas en este dispositivo');
}));

module.exports = router;
