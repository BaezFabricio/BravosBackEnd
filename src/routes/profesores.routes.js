const express = require('express');
const router = express.Router();
const profesoresController = require('../controllers/profesores.controller');

const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

// Asegúrate de que las rutas usen el objeto 'profesoresController' que importamos arriba
router.get('/mis-clases', authenticateToken, profesoresController.getMisClases);
router.get('/', authenticateToken, profesoresController.getAll);
router.get('/clases/:idClase/alumnos', authenticateToken, profesoresController.getAlumnosPorClase);
router.get('/clases/:idClase/horarios', authenticateToken, profesoresController.getHorariosPorClase);
router.get('/clases/:idClase/rutina', authenticateToken, profesoresController.getRutinaPorClase);
router.put('/asistencias/:idReserva', authenticateToken, profesoresController.marcarAsistencia);

module.exports = router;