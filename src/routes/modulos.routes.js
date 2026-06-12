import express from 'express';
import * as perfilesController from '../controllers/perfiles.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permissions.middleware.js';

const router = express.Router();

router.get('/', authenticateToken, requirePermission('Modulos', 'consulta'), perfilesController.getModulos);
router.get('/:id', authenticateToken, requirePermission('Modulos', 'consulta'), perfilesController.getModuloById);
router.post('/', authenticateToken, requirePermission('Modulos', 'alta'), perfilesController.createModulo);
router.put('/:id', authenticateToken, requirePermission('Modulos', 'modificacion'), perfilesController.updateModulo);
router.delete('/:id', authenticateToken, requirePermission('Modulos', 'baja'), perfilesController.deleteModulo);

export default router; // 🟢 Formato moderno