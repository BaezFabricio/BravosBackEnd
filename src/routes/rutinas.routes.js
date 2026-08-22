const express = require('express');
const router = express.Router();
const rutinasController = require('../controllers/rutinas.controller');

const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

router.get('/alumnos-disponibles', authenticateToken, requirePermission('profesor_rutinas', 'consulta'), rutinasController.getAlumnosDisponibles);

router.get('/', authenticateToken, requirePermission('profesor_rutinas', 'consulta'), rutinasController.getAll);
router.get('/:id', authenticateToken, requirePermission('profesor_rutinas', 'consulta'), rutinasController.getById);
router.post('/', authenticateToken, requirePermission('profesor_rutinas', 'alta'), rutinasController.insert);
router.put('/:id', authenticateToken, requirePermission('profesor_rutinas', 'modificacion'), rutinasController.update);
router.delete('/:id', authenticateToken, requirePermission('profesor_rutinas', 'baja'), rutinasController.delete);

module.exports = router;
