const { Router } = require('express');
const ctrl = require('../controllers/marcas.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = Router();

router.use(authenticateToken);

router.get('/ejercicios', ctrl.listarEjercicios);
router.get('/resumen', ctrl.resumen);
router.get('/', ctrl.listarMias);
router.post('/', ctrl.crearMarca);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
