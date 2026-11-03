const {
  customerInputSchema,
  customerPaymentSchema,
} = require('../validators/customerValidator');
const customerService = require('../services/customerService');

// @desc    Get customers list
// @route   GET /api/customers
// @access  Protected
const getCustomers = async (req, res, next) => {
  try {
    const result = await customerService.getCustomers({
      search: req.query.search,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Protected
const getCustomerById = async (req, res, next) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    res.status(200).json({
      success: true,
      data: customer,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create customer
// @route   POST /api/customers
// @access  Protected
const createCustomer = async (req, res, next) => {
  try {
    const parsed = customerInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Validation error',
        errors: parsed.error.errors,
      });
    }

    const customer = await customerService.createCustomer(parsed.data);
    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customer,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Protected
const updateCustomer = async (req, res, next) => {
  try {
    const parsed = customerInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Validation error',
        errors: parsed.error.errors,
      });
    }

    const customer = await customerService.updateCustomer(req.params.id, parsed.data);
    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: customer,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Record customer payment
// @route   POST /api/customers/:id/payments
// @access  Protected
const recordCustomerPayment = async (req, res, next) => {
  try {
    const parsed = customerPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Validation error',
        errors: parsed.error.errors,
      });
    }

    const result = await customerService.recordCustomerPayment(req.params.id, parsed.data);
    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get customer ledger statement
// @route   GET /api/customers/:id/ledger
// @access  Protected
const getCustomerLedger = async (req, res, next) => {
  try {
    const result = await customerService.getCustomerLedger(req.params.id, {
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      data: result,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  recordCustomerPayment,
  getCustomerLedger,
};

