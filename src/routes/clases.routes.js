const express = require('express');
const router = express.Router();
const clasesController = require('../controllers/clases.controller');

const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');


router.get('/disponibles', clasesController.getClasesDisponibles);

// Rutas existentes corregidas y protegidas:
router.get('/', authenticateToken, requirePermission('Clases', 'consulta'), clasesController.getAll);
router.get('/:id', authenticateToken, requirePermission('Clases', 'consulta'), clasesController.getById);
router.post('/', authenticateToken, requirePermission('Clases', 'alta'), clasesController.insert);
router.put('/:id', authenticateToken, requirePermission('Clases', 'modificacion'), clasesController.update);
router.patch('/:id/estado', authenticateToken, requirePermission('Clases', 'modificacion'), clasesController.updateEstado);
router.delete('/:id', authenticateToken, requirePermission('Clases', 'baja'), clasesController.delete);

module.exports = router;