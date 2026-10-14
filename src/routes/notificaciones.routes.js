const { Router } = require('express');
const ctrl = require('../controllers/notificaciones.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = Router();

router.use(authenticateToken);

router.get('/', ctrl.getMias);
router.delete('/', ctrl.limpiarMias);
router.post('/registro', ctrl.registrarAccion);
router.patch('/leer-todas', ctrl.marcarTodasLeidas);
router.patch('/:id/leer', ctrl.marcarLeida);

module.exports = router;
