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
 * POST /api/auth/recuperar-contrasena
 * Body: { email, action: 'send_code' | 'verify_code' | 'reset_password', code?, password? }
 */
router.post('/recuperar-contrasena', authController.recuperarContrasena);

/**
 * GET /api/auth/me
 * Devuelve la sesión actual
 */
router.get('/me', authenticateToken, authController.me);

/**
 * POST /api/auth/cambiar-contraseña
 * Permite a un usuario autenticado cambiar su contraseña
 */
router.post('/cambiar-contrasena', authenticateToken, authController.cambiarContrasena);

router.get('/verificar/:token', authController.verificarCuenta);

router.post('/reenviar-verificacion', authController.reenviarVerificacion);

// (Se eliminó la ruta /debug/user/:id: devolvía nombre, DNI, correo y teléfono de cualquier usuario sin pedir sesión.)

module.exports = router;
