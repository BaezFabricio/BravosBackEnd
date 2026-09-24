const express = require('express');
const router = express.Router();
const reservasController = require('../controllers/reservas.controller');


const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission, requireAnyPermission } = require('../middlewares/permissions.middleware');


router.post('/', authenticateToken, requireAnyPermission([['alumno_reservas', 'alta'], ['reservas', 'alta']]), reservasController.crearReserva);

router.get('/mis-reservas', authenticateToken, requireAnyPermission([['alumno_reservas', 'consulta'], ['reservas', 'consulta']]), reservasController.obtenerMisReservas);

router.get('/admin/usuario/:idUsuario', authenticateToken, requirePermission('Reservas', 'consulta'), reservasController.obtenerReservasDeUsuario);


router.patch('/:id/cancelar', authenticateToken, requireAnyPermission([['alumno_reservas', 'modificacion'], ['reservas', 'modificacion']]), reservasController.cancelarReserva);

router.get('/mis-creditos-movimientos', authenticateToken, reservasController.obtenerMisCreditosYMovimientos);

module.exports = router;