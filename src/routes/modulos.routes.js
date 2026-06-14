const express = require('express');
const router = express.Router();

// 🟢 Requerimos los métodos desestructurados desde tu nuevo módulo CommonJS
const { 
  getModulos, 
  getModuloById, 
  createModulo, 
  updateModulo, 
  deleteModulo 
} = require('../controllers/perfiles.controller.js');

const { authenticateToken } = require('../middlewares/auth.middleware.js');
const { requirePermission } = require('../middlewares/permissions.middleware.js');

router.get('/', authenticateToken, requirePermission('Modulos', 'consulta'), getModulos);
router.get('/:id', authenticateToken, requirePermission('Modulos', 'consulta'), getModuloById);
router.post('/', authenticateToken, requirePermission('Modulos', 'alta'), createModulo);
router.put('/:id', authenticateToken, requirePermission('Modulos', 'modificacion'), updateModulo);
router.delete('/:id', authenticateToken, requirePermission('Modulos', 'baja'), deleteModulo);

module.exports = router;