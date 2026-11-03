const express = require('express');
const router = express.Router();
const {
  createSale,
  getSales,
  getSaleById,
} = require('../controllers/saleController');

router.route('/')
  .get(getSales)
  .post(createSale);

router.route('/:id')
  .get(getSaleById);

module.exports = router;

