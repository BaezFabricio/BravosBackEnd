const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios.controller');
const { authenticateToken, isAdmin, ownProfileOrAdmin } = require('../middlewares/auth.middleware');
const { validateUpdateUser, handleValidationErrors } = require('../functions/validation');

/**
 * GET /api/usuarios
 * Obtiene todos los usuarios (requiere autenticación)
 */
router.get('/', authenticateToken, usuariosController.getAll);

/**
 * GET /api/usuarios/:id
 * Obtiene un usuario específico
 */
router.get('/:id', authenticateToken, ownProfileOrAdmin, usuariosController.getById);

/**
 * POST /api/usuarios
 * Crea un nuevo usuario (solo admin)
 */
router.post('/', authenticateToken, isAdmin, usuariosController.create);

/**
 * PUT /api/usuarios/:id
 * Actualiza un usuario
 */
router.put('/:id', authenticateToken, ownProfileOrAdmin, validateUpdateUser, handleValidationErrors, usuariosController.update);

/**
 * PUT /api/usuarios/:id/estado
 * Cambia el estado de un usuario (solo admin)
 */
router.put('/:id/estado', authenticateToken, isAdmin, usuariosController.cambiarEstado);

/**
 * DELETE /api/usuarios/:id
 * Elimina un usuario (solo admin)
 */
router.delete('/:id', authenticateToken, isAdmin, usuariosController.delete);

module.exports = router;
