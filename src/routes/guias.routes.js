const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { guiasVistas, marcarVista } = require('../functions/guias.service');

/*
 * Guías de bienvenida. Solo piden sesión (no un permiso): cada persona consulta y marca SUS propias
 * guías, y el usuario sale siempre del token, nunca de lo que manda el navegador.
 */

// Qué guías ya vio esta persona
router.get('/mias', authenticateToken, asyncHandler(async (req, res) => {
  return successResponse(res, 'Guías vistas', { vistas: await guiasVistas(req.user.idUsuario) });
}));

// Marcar una guía como vista (al terminarla o saltarla)
router.post('/:guia/vista', authenticateToken, asyncHandler(async (req, res) => {
  const ok = await marcarVista(req.user.idUsuario, String(req.params.guia));
  if (!ok) return errorResponse(res, 'Esa guía no existe.', 'NOT_FOUND', 404);
  return successResponse(res, 'Guía marcada como vista');
}));

module.exports = router;
