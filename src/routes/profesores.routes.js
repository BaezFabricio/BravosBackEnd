const express = require('express');
const router = express.Router();

const profesoresController = require('../controllers/profesores.controller');

router.get('/', profesoresController.getAll);

module.exports = router;