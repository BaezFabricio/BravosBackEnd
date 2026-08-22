const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportes.controller');

const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

router.get('/resumen', authenticateToken, requirePermission('dashboard', 'consulta'), reportesController.getResumen);

module.exports = router;
