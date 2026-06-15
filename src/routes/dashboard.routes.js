const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');

// Endpoint privado de administración
router.get('/metrics', authenticateToken, requirePermission('Dashboard', 'consulta'), dashboardController.getMetrics);

module.exports = router;