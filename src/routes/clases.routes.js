const express = require('express');
const router = express.Router();

const clasesController = require('../controllers/clases.controller');

router.get('/', clasesController.getAll);
router.get('/:id', clasesController.getById);
router.post('/', clasesController.insert);
router.put('/:id', clasesController.update);
router.patch('/:id/estado', clasesController.updateEstado);
router.delete('/:id', clasesController.delete);

module.exports = router;