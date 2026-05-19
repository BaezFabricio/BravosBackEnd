const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
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

module.exports = router;
