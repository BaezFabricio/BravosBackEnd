const { Router } = require('express');
const ctrl = require('../controllers/novedades.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

const router = Router();

// Cualquier persona con sesión ve las novedades vigentes (en la portada)
router.get('/vigentes', authenticateToken, ctrl.vigentes);

// Administrar las novedades: quien puede modificar la configuración del box
router.get('/', authenticateToken, requirePermission('configuracion', 'consulta'), ctrl.listar);
router.post('/', authenticateToken, requirePermission('configuracion', 'modificacion'), ctrl.crear);
router.put('/:id', authenticateToken, requirePermission('configuracion', 'modificacion'), ctrl.actualizar);
router.delete('/:id', authenticateToken, requirePermission('configuracion', 'modificacion'), ctrl.eliminar);

module.exports = router;
