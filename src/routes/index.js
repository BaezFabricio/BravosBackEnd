const express = require('express');
const { Router } = express;

// 1. IMPORTACIONES (Estructura limpia CommonJS)
const authRoutes = require('./auth.routes');
const usuariosRoutes = require('./usuarios.routes');
const perfilesRoutes = require('./perfiles.routes');
const modulosRoutes = require('./modulos.routes');
const clasesRoutes = require('./clases.routes'); 
const reservasRoutes = require('./reservas.routes');

const router = Router();

// 2. REGISTRO DE ENDPOINTS (Controlá que ninguno falte ni esté duplicado)
router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/perfiles', perfilesRoutes);
router.use('/modulos', modulosRoutes);
router.use('/clases', clasesRoutes); 
router.use('/reservas', reservasRoutes);

module.exports = router;