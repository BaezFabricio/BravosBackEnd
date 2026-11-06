const { Router } = require('express');
const ctrl = require('../controllers/asistenciaCheckin.controller');
const { crearLimitador } = require('../middlewares/rateLimit.middleware');

const router = Router();

// Sin sesión a propósito (es la pantalla de el check-in). Protegida por la clave del equipo y un límite por conexión.
const limiteEntradaPorIp = crearLimitador({
  ventanaMs: 60 * 1000, max: 30,
  clave: (req) => `checkin-ip:${req.ip}`,
  mensaje: 'Demasiados intentos desde esta pantalla. Esperá un momento.',
});

router.post('/check-in', limiteEntradaPorIp, ctrl.registrarEntrada);

module.exports = router;
