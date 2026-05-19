const express = require('express');
const router = express.Router();
const perfilesController = require('../controllers/perfiles.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

router.get('/', authenticateToken, requirePermission('Modulos', 'consulta'), perfilesController.getModulos);
router.get('/:id', authenticateToken, requirePermission('Modulos', 'consulta'), perfilesController.getModuloById);
router.post('/', authenticateToken, requirePermission('Modulos', 'alta'), perfilesController.createModulo);
router.put('/:id', authenticateToken, requirePermission('Modulos', 'modificacion'), perfilesController.updateModulo);
router.delete('/:id', authenticateToken, requirePermission('Modulos', 'baja'), perfilesController.deleteModulo);

module.exports = router;