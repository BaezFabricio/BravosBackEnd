const express = require('express')
const router = express.Router()
const { uploadVideo } = require('../controllers/ejercicios.controller')
const { authenticateToken } = require('../middlewares/auth.middleware')
const { requirePermission } = require('../middlewares/permissions.middleware')

router.post('/upload-video', authenticateToken, requirePermission('profesor_rutinas', 'alta'), uploadVideo)

module.exports = router
