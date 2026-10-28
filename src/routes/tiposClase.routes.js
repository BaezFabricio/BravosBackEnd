const express = require('express');
const router = express.Router();
const tiposController = require('../controllers/tiposClase.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission, requireAnyPermission } = require('../middlewares/permissions.middleware');

// Tipos de clase del box. Verlos: quien administra planes o clases. Crear, renombrar, desactivar y borrar: permiso de Membresías (planes).
router.get('/', authenticateToken, requireAnyPermission([['membresias', 'consulta'], ['Clases', 'consulta']]), tiposController.listar);
router.post('/', authenticateToken, requirePermission('membresias', 'alta'), tiposController.crear);
router.put('/:id', authenticateToken, requirePermission('membresias', 'modificacion'), tiposController.actualizar);
router.delete('/:id', authenticateToken, requirePermission('membresias', 'baja'), tiposController.borrar);

module.exports = router;
