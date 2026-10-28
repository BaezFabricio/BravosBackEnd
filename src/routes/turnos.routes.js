const express = require('express');
const router = express.Router();
const turnosController = require('../controllers/turnos.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

// Horarios de los turnos del box, visibles en la web pública (sin sesión: solo horas, turnos y tipos activos)
router.get('/publicos', turnosController.publicos);

// Horarios de los turnos del box (la lista que ofrece el formulario de nueva clase). Se manejan con el permiso de Clases.
router.get('/horarios', authenticateToken, requirePermission('Clases', 'consulta'), turnosController.listar);
router.post('/horarios', authenticateToken, requirePermission('Clases', 'alta'), turnosController.crear);
router.put('/horarios/:id', authenticateToken, requirePermission('Clases', 'modificacion'), turnosController.actualizar);
router.delete('/horarios/:id', authenticateToken, requirePermission('Clases', 'baja'), turnosController.borrar);

module.exports = router;
