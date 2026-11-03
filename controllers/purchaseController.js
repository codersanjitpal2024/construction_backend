const purchaseService = require('../services/purchaseService');
const {
  createPurchaseSchema,
  cancelPurchaseSchema,
} = require('../validators/purchaseValidator');

const createPurchase = async (req, res, next) => {
  try {
    const parseResult = createPurchaseSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation error',
        errors: parseResult.error.errors,
      });
    }

    const purchase = await purchaseService.createPurchase(parseResult.data);
    res.status(201).json({
      success: true,
      message: 'Purchase created successfully',
      data: purchase,
    });
  } catch (error) {
    next(error);
  }
};

const cancelPurchase = async (req, res, next) => {
  try {
    const parseResult = cancelPurchaseSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Cancellation reason is required',
      });
    }

    const purchase = await purchaseService.cancelPurchase(
      req.params.id,
      parseResult.data.reason
    );
    res.status(200).json({
      success: true,
      message: `Purchase ${purchase.purchaseNo} cancelled successfully`,
      data: purchase,
    });
  } catch (error) {
    next(error);
  }
};

const getPurchases = async (req, res, next) => {
  try {
    const result = await purchaseService.getPurchases(req.query);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

const getPurchaseById = async (req, res, next) => {
  try {
    const purchase = await purchaseService.getPurchaseById(req.params.id);
    res.status(200).json({
      success: true,
      data: purchase,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPurchase,
  cancelPurchase,
  getPurchases,
  getPurchaseById,
};

