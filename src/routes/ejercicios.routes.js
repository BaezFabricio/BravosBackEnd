const express = require('express')
const router = express.Router()
const { uploadVideo } = require('../controllers/ejercicios.controller')
const variantesController = require('../controllers/variantes.controller')
const { authenticateToken } = require('../middlewares/auth.middleware')
const { requirePermission } = require('../middlewares/permissions.middleware')

router.post('/upload-video', authenticateToken, uploadVideo)

// Variantes de ejercicios
router.get('/:idEjercicio/variantes', authenticateToken, variantesController.getByEjercicio)
router.post('/:idEjercicio/variantes', authenticateToken, requirePermission('profesor_rutinas', 'modificacion'), variantesController.create)
router.put('/:idEjercicio/variantes/:idVariante', authenticateToken, requirePermission('profesor_rutinas', 'modificacion'), variantesController.update)
router.delete('/:idEjercicio/variantes/:idVariante', authenticateToken, requirePermission('profesor_rutinas', 'baja'), variantesController.remove)

module.exports = router
