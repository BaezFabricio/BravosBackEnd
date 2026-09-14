const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');
const documentosController = require('../controllers/documentos.controller');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/documentos'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'doc-' + unique + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Solo se permiten imágenes o PDF'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// Alumno sube su propio documento
router.post('/subir', authenticateToken, upload.single('archivo'), documentosController.subirDocumento);

// Alumno ve sus propios documentos
router.get('/mis-documentos', authenticateToken, documentosController.misDocumentos);

// Admin ve documentos de cualquier usuario
router.get('/usuario/:id', authenticateToken, requirePermission('Usuarios', 'consulta'), documentosController.documentosPorUsuario);

// Admin aprueba un documento
router.patch('/:id/aprobar', authenticateToken, requirePermission('Usuarios', 'modificacion'), documentosController.aprobarDocumento);

module.exports = router;
