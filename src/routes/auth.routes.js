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

// Ruta de depuración: devuelve datos crudos de usuario por id (solo en development)
if (process.env.NODE_ENV !== 'production') {
	router.get('/debug/user/:id', async (req, res) => {
		try {
			const db = require('../config/db');
			const obtenerUsuarioRegistrado = require('../data/Auth/ObtenerUsuarioRegistrado');
			const [rows] = await db.query(obtenerUsuarioRegistrado, [req.params.id]);
			return res.json({ success: true, data: rows[0] || null });
		} catch (err) {
			console.error('Debug route error:', err);
			return res.status(500).json({ success: false, message: 'Error interno' });
		}
	});
}

module.exports = router;
