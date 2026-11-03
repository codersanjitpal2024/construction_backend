const express = require('express');
const router = express.Router();
const { getHealth, getDbHealth } = require('../controllers/healthController');

router.get('/', getHealth);
// router.get('/db', getDbHealth);

module.exports = router;

