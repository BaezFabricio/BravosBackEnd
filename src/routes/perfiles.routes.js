const express = require('express');
const { obtenerPerfiles, guardarPerfilCompleto, eliminarPerfil } = require('../controllers/perfiles.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');
const { requirePermission } = require('../middlewares/permissions.middleware.js');

const router = express.Router();

router.get("/", authenticateToken, requirePermission('perfiles', 'consulta'), obtenerPerfiles);
router.post("/", authenticateToken, requirePermission('perfiles', 'alta'), guardarPerfilCompleto);
router.put("/", authenticateToken, requirePermission('perfiles', 'modificacion'), guardarPerfilCompleto);
router.delete("/:id", authenticateToken, requirePermission('perfiles', 'baja'), eliminarPerfil);
module.exports = router;