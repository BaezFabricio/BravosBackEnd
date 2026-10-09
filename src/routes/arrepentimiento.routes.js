const express = require('express');
const router = express.Router();
const arrepentimientoController = require('../controllers/arrepentimiento.controller');
const { crearLimitador } = require('../middlewares/rateLimit.middleware');

// Pública a propósito (Res. SCI 424/2020: no puede exigir registro ni inicio de sesión).
// El límite evita que se use para llenar la base o mandar correos en masa.
const limiteArrepentimientoPorIp = crearLimitador({
  ventanaMs: 60 * 60 * 1000, max: 5,
  clave: (req) => `arrepentimiento-ip:${req.ip}`,
  mensaje: 'Ya enviaste varias solicitudes. Si necesitás algo más, escribinos por correo o WhatsApp.',
});

router.post('/', limiteArrepentimientoPorIp, arrepentimientoController.crearSolicitud);

module.exports = router;
