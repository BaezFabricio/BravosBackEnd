const express = require('express');
const router = express.Router();
const planesController = require('../controllers/planes.controller');

const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

router.get('/', authenticateToken, requirePermission('membresias', 'consulta'), planesController.getAll);
router.get('/:id', authenticateToken, requirePermission('membresias', 'consulta'), planesController.getById);
router.post('/', authenticateToken, requirePermission('membresias', 'alta'), planesController.insert);
router.put('/:id', authenticateToken, requirePermission('membresias', 'modificacion'), planesController.update);
router.delete('/:id', authenticateToken, requirePermission('membresias', 'baja'), planesController.delete);

module.exports = router;
