const express = require('express');
const { obtenerPerfiles, guardarPerfilCompleto, eliminarPerfil } = require('../controllers/perfiles.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');
const { requirePermission } = require('../middlewares/permissions.middleware.js');

const router = express.Router();

router.get("/", obtenerPerfiles);         
router.post("/", guardarPerfilCompleto);   
router.put("/", guardarPerfilCompleto);  
router.delete("/:id", eliminarPerfil); 

module.exports = router;