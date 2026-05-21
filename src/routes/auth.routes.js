const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { validateRegister, validateLogin, handleValidationErrors } = require('../functions/validation');

/**
 * POST /api/auth/registro
 * Registra un nuevo usuario
 */
router.post('/registro', validateRegister, handleValidationErrors, authController.registro);

/**
 * POST /api/auth/login
 * Inicia sesión
 */
router.post('/login', validateLogin, handleValidationErrors, authController.login);

/**
 * GET /api/auth/me
 * Devuelve la sesión actual
 */
router.get('/me', authenticateToken, authController.me);

router.get('/verificar/:token', authController.verificarCuenta);

router.post('/reenviar-verificacion', authController.reenviarVerificacion);

module.exports = router;
