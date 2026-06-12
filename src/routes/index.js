import { Router } from 'express';
import authRoutes from './auth.routes.js';
import usuariosRoutes from './usuarios.routes.js';
import perfilesRoutes from './perfiles.routes.js';
import modulosRoutes from './modulos.routes.js';
import landingRoutes from './landing.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/perfiles', perfilesRoutes);
router.use('/modulos', modulosRoutes);
router.use('/landing', landingRoutes);

export default router; 