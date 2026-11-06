const { Router } = require('express');
const multer = require('multer');
const os = require('os');
const ctrl = require('../controllers/novedades.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');
const { errorResponse } = require('../utils/response');

const router = Router();

// Foto de la novedad: una sola imagen de hasta 5 MB, guardada fuera de la carpeta pública y borrada después de subirla
const subida = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) return cb(null, true);
    const error = new Error('Solo se permiten imágenes JPG, PNG, WEBP o GIF');
    error.statusCode = 400;
    cb(error);
  },
}).single('imagen');

const recibirImagen = (req, res, next) => subida(req, res, (err) => {
  if (!err) return next();
  const mensaje = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen pesa más de 5 MB' : (err.message || 'No se pudo recibir la imagen');
  return errorResponse(res, mensaje, 'VALIDATION_ERROR', 400);
});

// Cualquier persona con sesión ve las novedades vigentes (en la portada)
router.get('/vigentes', authenticateToken, ctrl.vigentes);

// Administrar las novedades: quien puede modificar la configuración del box
router.get('/', authenticateToken, requirePermission('configuracion', 'consulta'), ctrl.listar);
router.post('/', authenticateToken, requirePermission('configuracion', 'modificacion'), recibirImagen, ctrl.crear);
router.put('/:id', authenticateToken, requirePermission('configuracion', 'modificacion'), recibirImagen, ctrl.actualizar);
router.delete('/:id', authenticateToken, requirePermission('configuracion', 'modificacion'), ctrl.eliminar);

module.exports = router;
