const { Router } = require('express');
const ctrl = require('../controllers/reglasBox.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

const router = Router();

// Reglas de reservas del box: ver las reglas y sus límites exige configuración: consulta; cambiarlas, configuración: modificación
router.get('/', authenticateToken, requirePermission('configuracion', 'consulta'), ctrl.obtener);
router.put('/', authenticateToken, requirePermission('configuracion', 'modificacion'), ctrl.actualizar);

module.exports = router;
