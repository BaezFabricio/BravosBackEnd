const express = require('express');
const authRoutes = require('./auth.routes');
const usuariosRoutes = require('./usuarios.routes');
const perfilesRoutes = require('./perfiles.routes');
const modulosRoutes = require('./modulos.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/perfiles', perfilesRoutes);
router.use('/modulos', modulosRoutes);

module.exports = router;
