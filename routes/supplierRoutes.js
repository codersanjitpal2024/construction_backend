const express = require('express');
const router = express.Router();
const {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  toggleSupplierStatus,
  recordPayment,
  getLedger,
} = require('../controllers/supplierController');

router.route('/')
  .get(getSuppliers)
  .post(createSupplier);

router.route('/:id')
  .get(getSupplierById)
  .put(updateSupplier);

router.patch('/:id/status', toggleSupplierStatus);
router.post('/:id/payments', recordPayment);
router.get('/:id/ledger', getLedger);

module.exports = router;

