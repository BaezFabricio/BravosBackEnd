const express = require('express')
const router = express.Router()
const pagosCtrl = require('../controllers/pagos.controller')
const { authenticateToken } = require('../middlewares/auth.middleware')

// Requiere auth de alumno
router.post('/crear-preferencia', authenticateToken, pagosCtrl.crearPreferencia)

router.post('/procesar-tarjeta', authenticateToken, pagosCtrl.procesarTarjeta)

// El modal de pago consulta esto mientras espera un cobro que se confirma
// afuera del navegador (QR pagado desde otro dispositivo, Mercado Crédito).
router.get('/estado/:idPlan', authenticateToken, pagosCtrl.estadoPago)

// MP llama sin auth — no usar authenticateToken aquí
router.post('/webhook', pagosCtrl.webhook)

// Planes disponibles (público)
router.get('/planes', pagosCtrl.getPlanes)

module.exports = router
