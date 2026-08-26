const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { successResponse, errorResponse } = require('../utils/response')

const uploadsDir = path.join(__dirname, '../../uploads/videos')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, unique + path.extname(file.originalname).toLowerCase())
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error('Solo se permiten videos (mp4, webm, mov, avi, mkv)'))
  }
})

exports.uploadVideo = [
  upload.single('video'),
  (req, res) => {
    if (!req.file) return errorResponse(res, 'No se recibió ningún archivo de video', 'NO_FILE', 400)
    const url = `/uploads/videos/${req.file.filename}`
    return successResponse(res, 'Video subido correctamente', { url })
  }
]
