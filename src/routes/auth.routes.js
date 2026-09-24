const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { crearLimitador, minusculas } = require('../middlewares/rateLimit.middleware');

// Freno a la fuerza bruta (probar contraseñas o códigos a miles por segundo).
const MIN15 = 15 * 60 * 1000;
const limiteLoginPorCuenta = crearLimitador({
  ventanaMs: MIN15, max: 8, soloFallos: true,
  clave: (req) => `login:${minusculas(req.body?.correo)}`,
  mensaje: 'Demasiados intentos fallidos. Por seguridad, esperá unos minutos antes de volver a intentar.',
});
const limiteLoginPorIp = crearLimitador({
  ventanaMs: MIN15, max: 100, soloFallos: true,
  clave: (req) => `login-ip:${req.ip}`,
});
const limiteRecuperacionPorIp = crearLimitador({
  ventanaMs: MIN15, max: 40,
  clave: (req) => `recuperar-ip:${req.ip}`,
  mensaje: 'Demasiados intentos. Esperá unos minutos antes de volver a intentar.',
});
const limiteRegistroPorIp = crearLimitador({
  ventanaMs: 60 * 60 * 1000, max: 15,
  clave: (req) => `registro-ip:${req.ip}`,
  mensaje: 'Demasiados registros desde esta conexión. Probá de nuevo más tarde.',
});
const limiteReenvioPorIp = crearLimitador({
  ventanaMs: 60 * 60 * 1000, max: 10,
  clave: (req) => `reenvio-ip:${req.ip}`,
  mensaje: 'Demasiados reenvíos. Probá de nuevo más tarde.',
});
const { validateRegister, validateLogin, handleValidationErrors } = require('../functions/validation');

/**
 * POST /api/auth/registro
 * Registra un nuevo usuario
 */
router.post('/registro', limiteRegistroPorIp, validateRegister, handleValidationErrors, authController.registro);

/**
 * POST /api/auth/login
 * Inicia sesión
 */
router.post('/login', limiteLoginPorIp, limiteLoginPorCuenta, validateLogin, handleValidationErrors, authController.login);

/**
 * POST /api/auth/recuperar-contrasena
 * Body: { email, action: 'send_code' | 'verify_code' | 'reset_password', code?, password? }
 */
router.post('/recuperar-contrasena', limiteRecuperacionPorIp, authController.recuperarContrasena);

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

router.post('/reenviar-verificacion', limiteReenvioPorIp, authController.reenviarVerificacion);

// (Se eliminó la ruta /debug/user/:id: devolvía nombre, DNI, correo y teléfono de cualquier usuario sin pedir sesión.)

module.exports = router;
