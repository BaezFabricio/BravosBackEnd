const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { successResponse, errorResponse } = require('../utils/response')
const { esVideoIso, limpiarVideoIso } = require('../utils/videos')

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

// Subir videos de ejercicios es una tarea de quien da las clases: hace falta tener ficha de profesor
const soloConFichaDeProfesor = (req, res, next) =>
  req.user?.idProfesor ? next() : errorResponse(res, 'Solo un profesor puede subir videos.', 'NO_PROFESOR', 403)

exports.uploadVideo = [
  soloConFichaDeProfesor,
  upload.single('video'),
  (req, res) => {
    if (!req.file) return errorResponse(res, 'No se recibió ningún archivo de video', 'NO_FILE', 400)
    // Un video de celular trae ubicación GPS, modelo del teléfono y fecha de grabación, y esta carpeta es pública: se limpia (MP4 y MOV)
    try {
      if (esVideoIso(req.file.path)) limpiarVideoIso(req.file.path)
    } catch (error) {
      fs.unlink(req.file.path, () => {})
      return errorResponse(res, 'No se pudo procesar el video. Probá con otro archivo MP4.', 'VIDEO_INVALIDO', 400)
    }
    const url = `/uploads/videos/${req.file.filename}`
    return successResponse(res, 'Video subido correctamente', { url })
  }
]
