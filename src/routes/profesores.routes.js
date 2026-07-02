const express = require('express');
const router = express.Router();
const profesoresController = require('../controllers/profesores.controller');

const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

// Asegúrate de que las rutas usen el objeto 'profesoresController' que importamos arriba
router.get('/:idProfesor/clases', profesoresController.getClasesDelProfesor);
router.get('/', authenticateToken, profesoresController.getAll);
router.get('/clases/:idClase/alumnos', authenticateToken, profesoresController.getAlumnosPorClase);

module.exports = router;