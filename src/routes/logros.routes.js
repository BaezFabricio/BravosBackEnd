const { Router } = require('express');
const ctrl = require('../controllers/logros.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/sincronizar', authenticateToken, ctrl.sincronizar);

module.exports = router;
