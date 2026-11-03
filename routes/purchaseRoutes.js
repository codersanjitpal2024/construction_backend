const express = require('express');
const router = express.Router();
const {
  getPurchases,
  getPurchaseById,
  createPurchase,
  cancelPurchase,
} = require('../controllers/purchaseController');

router.route('/')
  .get(getPurchases)
  .post(createPurchase);

router.route('/:id')
  .get(getPurchaseById);

router.post('/:id/cancel', cancelPurchase);

module.exports = router;

