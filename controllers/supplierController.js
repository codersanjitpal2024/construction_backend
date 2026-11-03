const supplierService = require('../services/supplierService');
const {
  supplierSchema,
  supplierPaymentSchema,
} = require('../validators/supplierValidator');

const getSuppliers = async (req, res, next) => {
  try {
    const result = await supplierService.getSuppliers(req.query);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

const getSupplierById = async (req, res, next) => {
  try {
    const supplier = await supplierService.getSupplierById(req.params.id);
    res.status(200).json({
      success: true,
      data: supplier,
    });
  } catch (error) {
    next(error);
  }
};

const createSupplier = async (req, res, next) => {
  try {
    const parseResult = supplierSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation error',
        errors: parseResult.error.errors,
      });
    }

    const supplier = await supplierService.createSupplier(parseResult.data);
    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      data: supplier,
    });
  } catch (error) {
    next(error);
  }
};

const updateSupplier = async (req, res, next) => {
  try {
    const parseResult = supplierSchema.partial().safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation error',
        errors: parseResult.error.errors,
      });
    }

    const supplier = await supplierService.updateSupplier(
      req.params.id,
      parseResult.data
    );
    res.status(200).json({
      success: true,
      message: 'Supplier updated successfully',
      data: supplier,
    });
  } catch (error) {
    next(error);
  }
};

const toggleSupplierStatus = async (req, res, next) => {
  try {
    const supplier = await supplierService.toggleSupplierStatus(
      req.params.id,
      req.body.isActive
    );
    res.status(200).json({
      success: true,
      message: supplier.isActive
        ? 'Supplier restored successfully'
        : 'Supplier archived successfully',
      data: supplier,
    });
  } catch (error) {
    next(error);
  }
};

const recordPayment = async (req, res, next) => {
  try {
    const parseResult = supplierPaymentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation error',
        errors: parseResult.error.errors,
      });
    }

    const { amount, paymentMode, date, note } = parseResult.data;
    const result = await supplierService.recordSupplierPayment(
      req.params.id,
      amount,
      paymentMode,
      date,
      note
    );

    res.status(200).json({
      success: true,
      message: 'Payment recorded successfully',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

const getLedger = async (req, res, next) => {
  try {
    const { from, to, page, limit } = req.query;
    const ledger = await supplierService.getSupplierLedger(
      req.params.id,
      from,
      to,
      page,
      limit
    );
    res.status(200).json({
      success: true,
      data: ledger,
      pagination: ledger.pagination,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  toggleSupplierStatus,
  recordPayment,
  getLedger,
};

