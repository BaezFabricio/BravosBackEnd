// src/routes/index.js
const { Router } = require('express');
const authRoutes = require('./auth.routes.js');
const usuariosRoutes = require('./usuarios.routes.js');
const perfilesRoutes = require('./perfiles.routes.js');
const modulosRoutes = require('./modulos.routes.js');
const landingRoutes = require('./landing.routes.js'); 

const router = Router();

router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/perfiles', perfilesRoutes);
router.use('/modulos', modulosRoutes);
router.use('/landing', landingRoutes); 

module.exports = router;