const { Router } = require('express');
const { obtenerConfiguracion, actualizarConfiguracion } = require('../controllers/landing.controller.js');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });
const router = Router();

router.get('/config', obtenerConfiguracion);
router.put('/config', upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'imagenHero1', maxCount: 1 },
  { name: 'imagenHero2', maxCount: 1 },
  { name: 'imagenHero3', maxCount: 1 }
]), actualizarConfiguracion);

module.exports = router;