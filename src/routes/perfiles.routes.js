const express = require('express');
const router = express.Router();
const perfilesController = require('../controllers/perfiles.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

router.get('/:id/permisos', authenticateToken, requirePermission('Perfiles', 'consulta'), perfilesController.getPermisosByPerfil);
router.put('/:id/permisos', authenticateToken, requirePermission('Perfiles', 'modificacion'), perfilesController.asignarPermisos);
router.delete('/:id/permisos/:idModulo', authenticateToken, requirePermission('Perfiles', 'baja'), perfilesController.eliminarPermisos);

router.get('/', authenticateToken, requirePermission('Perfiles', 'consulta'), perfilesController.getAll);
router.get('/:id', authenticateToken, requirePermission('Perfiles', 'consulta'), perfilesController.getById);
router.post('/', authenticateToken, requirePermission('Perfiles', 'alta'), perfilesController.create);
router.put('/:id', authenticateToken, requirePermission('Perfiles', 'modificacion'), perfilesController.update);
router.delete('/:id', authenticateToken, requirePermission('Perfiles', 'baja'), perfilesController.delete);

module.exports = router;