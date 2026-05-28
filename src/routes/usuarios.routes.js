const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission, allowSelfOrPermission } = require('../middlewares/permissions.middleware');
const { validateUpdateUser, handleValidationErrors } = require('../functions/validation');

/**
 * GET /api/usuarios
 * Obtiene todos los usuarios (requiere autenticación)
 */
router.get('/', authenticateToken, requirePermission('Usuarios', 'consulta'), usuariosController.getAll);

/**
 * GET /api/usuarios/:id
 * Obtiene un usuario específico
 */
router.get('/:id', authenticateToken, allowSelfOrPermission('Usuarios', 'consulta'), usuariosController.getById);

/**
 * POST /api/usuarios
 * Crea un nuevo usuario (solo admin)
 */
router.post('/', authenticateToken, requirePermission('Usuarios', 'alta'), usuariosController.create);

/**
 * PUT /api/usuarios/:id
 * Actualiza un usuario
 */
router.put('/:id', authenticateToken, allowSelfOrPermission('Usuarios', 'modificacion'), validateUpdateUser, handleValidationErrors, usuariosController.update);

/**
 * PUT /api/usuarios/:id/avatar
 * Actualiza la foto de perfil del usuario
 */
router.put('/:id/avatar', authenticateToken, allowSelfOrPermission('Usuarios', 'modificacion'), usuariosController.updateAvatar);

/**
 * PUT /api/usuarios/:id/estado
 * Cambia el estado de un usuario (solo admin)
 */
router.put('/:id/estado', authenticateToken, requirePermission('Usuarios', 'modificacion'), usuariosController.cambiarEstado);

/**
 * DELETE /api/usuarios/:id
 * Elimina un usuario (solo admin)
 */
router.delete('/:id', authenticateToken, requirePermission('Usuarios', 'baja'), usuariosController.delete);

module.exports = router;
