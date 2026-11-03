const express = require('express');
const router = express.Router();
const {
  getInventory,
  getProductMovements,
  adjustStock,
} = require('../controllers/inventoryController');

router.get('/', getInventory);
router.get('/:productId/movements', getProductMovements);
router.post('/:productId/adjust', adjustStock);

module.exports = router;

