const inventoryService = require('../services/inventoryService');
const { adjustStockSchema } = require('../validators/inventoryValidator');

const getInventory = async (req, res, next) => {
  try {
    const result = await inventoryService.getInventory(req.query);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

const getProductMovements = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await inventoryService.getProductMovements(
      req.params.productId,
      page,
      limit
    );
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

const adjustStock = async (req, res, next) => {
  try {
    const parseResult = adjustStockSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation error',
        errors: parseResult.error.errors,
      });
    }

    const result = await inventoryService.adjustStock(
      req.params.productId,
      parseResult.data
    );

    res.status(200).json({
      success: true,
      message: 'Stock adjusted successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInventory,
  getProductMovements,
  adjustStock,
};

