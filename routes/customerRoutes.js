const express = require('express');
const router = express.Router();
const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  recordCustomerPayment,
  getCustomerLedger,
} = require('../controllers/customerController');

router.route('/')
  .get(getCustomers)
  .post(createCustomer);

router.route('/:id')
  .get(getCustomerById)
  .put(updateCustomer);

router.post('/:id/payments', recordCustomerPayment);
router.get('/:id/ledger', getCustomerLedger);

module.exports = router;

