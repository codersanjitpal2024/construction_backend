const express = require('express');
const router = express.Router();
const { getUnits } = require('../controllers/metaController');

router.get('/units', getUnits);

module.exports = router;

