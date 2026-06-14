const express = require('express');
const router = express.Router();
const profesoresController = require('../controllers/profesores.controller');


const { authenticateToken } = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/permissions.middleware');


router.get('/', authenticateToken, profesoresController.getAll);
module.exports = router;