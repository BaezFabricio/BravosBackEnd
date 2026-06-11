const express = require('express');
const authRoutes = require('./auth.routes');
const usuariosRoutes = require('./usuarios.routes');
const perfilesRoutes = require('./perfiles.routes');
const modulosRoutes = require('./modulos.routes');
const clasesRoutes = require('./clases.routes');

const router = express.Router();

/**
 * Rutas de API
 */
router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/perfiles', perfilesRoutes);
router.use('/modulos', modulosRoutes);
router.use('/clases', clasesRoutes);

module.exports = router;