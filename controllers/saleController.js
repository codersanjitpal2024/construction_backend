const { saleInputSchema } = require('../validators/saleValidator');
const saleService = require('../services/saleService');

// @desc    Create a new sale invoice
// @route   POST /api/sales
// @access  Protected
const createSale = async (req, res, next) => {
  try {
    const parsed = saleInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Validation error',
        errors: parsed.error.errors,
      });
    }

    const sale = await saleService.createSale(parsed.data);
    res.status(201).json({
      success: true,
      message: 'Sale invoice created successfully',
      data: sale,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get sales list
// @route   GET /api/sales
// @access  Protected
const getSales = async (req, res, next) => {
  try {
    const result = await saleService.getSales({
      search: req.query.search,
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

// @desc    Get single sale by ID
// @route   GET /api/sales/:id
// @access  Protected
const getSaleById = async (req, res, next) => {
  try {
    const sale = await saleService.getSaleById(req.params.id);
    res.status(200).json({
      success: true,
      data: sale,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSale,
  getSales,
  getSaleById,
};

