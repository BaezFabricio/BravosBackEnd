const { Router } = require('express');
const ctrl = require('../controllers/marcas.controller');
const ranking = require('../controllers/ranking.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

const router = Router();

// Pública a propósito: la página pública del ranking (primeros 20 por ejercicio). Solo nombre y marca.
router.get('/ranking-publico', ranking.rankingPublico);

router.use(authenticateToken);

router.get('/ejercicios', ctrl.listarEjercicios);
router.get('/ranking', ranking.ranking);
router.get('/resumen', ctrl.resumen);

// Catálogo general de ejercicios: lo administra quien puede modificar la configuración
router.get('/catalogo', requirePermission('configuracion', 'consulta'), ranking.listarCatalogo);
router.post('/catalogo', requirePermission('configuracion', 'modificacion'), ranking.crearEjercicio);
router.put('/catalogo/:id', requirePermission('configuracion', 'modificacion'), ranking.renombrarEjercicio);
router.delete('/catalogo/:id', requirePermission('configuracion', 'modificacion'), ranking.eliminarEjercicio);

router.get('/', ctrl.listarMias);
router.post('/', ctrl.crearMarca);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
