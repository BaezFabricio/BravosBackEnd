const express = require('express')
const router = express.Router()
const { uploadVideo } = require('../controllers/ejercicios.controller')
const { authenticateToken } = require('../middlewares/auth.middleware')

router.post('/upload-video', authenticateToken, uploadVideo)

module.exports = router
