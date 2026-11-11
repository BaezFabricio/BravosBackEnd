const express = require('express');
const router = express.Router();
const bravoCtrl = require('../controllers/bravo.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { crearLimitador } = require('../middlewares/rateLimit.middleware');

// Cada consulta al asistente gasta cuota del modelo: tope por persona
const limiteAsistente = crearLimitador({
  ventanaMs: 10 * 60 * 1000,
  max: 20,
  clave: (req) => (req.user ? `bravo:${req.user.idUsuario}` : null),
  mensaje: 'Estás preguntando muy rápido. Esperá unos minutos y volvé a intentar.',
});

// Sesión + límite; el permiso de panel (alumno o admin) se verifica en el controlador contra el perfil real
router.post('/preguntar', authenticateToken, limiteAsistente, bravoCtrl.preguntar);

module.exports = router;
