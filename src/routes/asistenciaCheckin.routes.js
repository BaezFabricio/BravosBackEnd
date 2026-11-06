const { Router } = require('express');
const ctrl = require('../controllers/asistenciaCheckin.controller');
const { crearLimitador } = require('../middlewares/rateLimit.middleware');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

const router = Router();

// Sin sesión a propósito (es el equipo de la recepción). Protegida por la clave del equipo y un límite por conexión.
const limiteCheckinPorIp = crearLimitador({
  ventanaMs: 60 * 1000, max: 30,
  clave: (req) => `checkin-ip:${req.ip}`,
  mensaje: 'Demasiados intentos desde este equipo. Esperá un momento.',
});
router.post('/check-in', limiteCheckinPorIp, ctrl.registrarEntrada);

// Panel del administrador: estado y clave del check-in
router.get('/check-in/estado', authenticateToken, requirePermission('configuracion', 'consulta'), ctrl.estado);
router.post("/check-in/clave", authenticateToken, requirePermission("configuracion", "modificacion"), ctrl.guardarClave);

module.exports = router;
