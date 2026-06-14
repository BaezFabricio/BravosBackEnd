const express = require('express');
const router = express.Router();
const reservasController = require('../controllers/reservas.controller');


const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');


router.post('/', authenticateToken, requirePermission('Reservas', 'alta'), reservasController.crearReserva);

router.get('/mis-reservas', authenticateToken, requirePermission('Reservas', 'consulta'), reservasController.obtenerMisReservas);


router.patch('/:id/cancelar', authenticateToken, requirePermission('Reservas', 'modificacion'), reservasController.cancelarReserva);

module.exports = router;