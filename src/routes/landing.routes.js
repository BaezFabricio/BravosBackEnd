const express = require('express');
const { Router } = express;
const { obtenerConfiguracion, actualizarConfiguracion, obtenerDatosBancarios, actualizarDatosBancarios } = require('../controllers/landing.controller.js');
const multer = require('multer');
const os = require('os');
const { authenticateToken } = require('../middlewares/auth.middleware.js');
const { requirePermission } = require('../middlewares/permissions.middleware.js');

// Solo imágenes y de hasta 5 MB (sin límites, cualquiera con permiso podría llenar el disco o subir archivos peligrosos)
const upload = multer({
  dest: os.tmpdir(), // fuera de la carpeta pública: lo que sube multer no tiene que poder verse desde internet
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) return cb(null, true);
    const error = new Error('Solo se permiten imágenes JPG, PNG, WEBP o GIF');
    error.statusCode = 400;
    cb(error);
  },
});
const router = Router();

router.get('/config', obtenerConfiguracion);
router.put('/config', authenticateToken, requirePermission('configuracion', 'modificacion'), upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'imagenHero1', maxCount: 1 },
  { name: 'imagenHero2', maxCount: 1 },
  { name: 'imagenHero3', maxCount: 1 },
  // Las fotos de "Sobre nosotros" y de las tarjetas de clases (antes faltaban y el guardado fallaba)
  { name: 'imagenNosotros', maxCount: 1 },
  { name: 'imagenClase1', maxCount: 1 },
  { name: 'imagenClase2', maxCount: 1 },
  { name: 'imagenClase3', maxCount: 1 },
]), actualizarConfiguracion);

// Datos bancarios: los ve cualquier usuario con sesión (el alumno los necesita para transferir)
// y los cambia solo quien puede modificar la configuración
router.get('/banco', authenticateToken, obtenerDatosBancarios);
router.put('/banco', authenticateToken, requirePermission('configuracion', 'modificacion'), express.json({ limit: '10kb' }), actualizarDatosBancarios);

module.exports = router;