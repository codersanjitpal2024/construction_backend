const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductUnits,
  toggleProductStatus,
  searchProducts,
} = require('../controllers/productController');

router.get('/search', searchProducts);

router.route('/')
  .get(getProducts)
  .post(createProduct);

router.route('/:id')
  .get(getProductById)
  .put(updateProduct);

router.patch('/:id/status', toggleProductStatus);
router.patch('/:id/units', updateProductUnits);

module.exports = router;

