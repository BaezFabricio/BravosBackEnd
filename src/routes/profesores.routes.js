const express = require('express');
const router = express.Router();
const profesoresController = require('../controllers/profesores.controller');

const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission, requireAnyPermission } = require('../middlewares/permissions.middleware');

// Asegúrate de que las rutas usen el objeto 'profesoresController' que importamos arriba
router.get('/mis-clases', authenticateToken, requirePermission('profesor', 'consulta'), profesoresController.getMisClases);
router.get('/', authenticateToken, requireAnyPermission([['profesor', 'consulta'], ['clases', 'alta'], ['clases', 'modificacion']]), profesoresController.getAll);
router.get('/clases/:idClase/alumnos', authenticateToken, requirePermission('profesor', 'consulta'), profesoresController.getAlumnosPorClase);
router.get('/clases/:idClase/horarios', authenticateToken, requirePermission('profesor', 'consulta'), profesoresController.getHorariosPorClase);
router.get('/clases/:idClase/rutina', authenticateToken, requireAnyPermission([['profesor', 'consulta'], ['alumno_reservas', 'consulta']]), profesoresController.getRutinaPorClase);
router.put('/asistencias/:idReserva', authenticateToken, requirePermission('profesor', 'modificacion'), profesoresController.marcarAsistencia);

module.exports = router;