const { Router } = require('express');
const { obtenerConfiguracion, actualizarConfiguracion } = require('../controllers/landing.controller.js');
const multer = require('multer');
const { authenticateToken } = require('../middlewares/auth.middleware.js');
const { requirePermission } = require('../middlewares/permissions.middleware.js');

// Solo imágenes y de hasta 5 MB (sin límites, cualquiera con permiso podría llenar el disco o subir archivos peligrosos)
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
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
  { name: 'imagenHero3', maxCount: 1 }
]), actualizarConfiguracion);

module.exports = router;