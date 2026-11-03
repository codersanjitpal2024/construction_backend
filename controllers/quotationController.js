const {
  quotationInputSchema,
  quotationStatusSchema,
} = require('../validators/quotationValidator');
const quotationService = require('../services/quotationService');

// @desc    Create a new quotation
// @route   POST /api/quotations
// @access  Protected
const createQuotation = async (req, res, next) => {
  try {
    const parsed = quotationInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Validation error',
        errors: parsed.error.errors,
      });
    }

    const quotation = await quotationService.createQuotation(parsed.data);
    res.status(201).json({
      success: true,
      message: 'Quotation created successfully',
      data: quotation,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get quotations list
// @route   GET /api/quotations
// @access  Protected
const getQuotations = async (req, res, next) => {
  try {
    const result = await quotationService.getQuotations({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      status: req.query.status,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single quotation by ID
// @route   GET /api/quotations/:id
// @access  Protected
const getQuotationById = async (req, res, next) => {
  try {
    const quotation = await quotationService.getQuotationById(req.params.id);
    res.status(200).json({
      success: true,
      data: quotation,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update an open quotation
// @route   PUT /api/quotations/:id
// @access  Protected
const updateQuotation = async (req, res, next) => {
  try {
    const parsed = quotationInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Validation error',
        errors: parsed.error.errors,
      });
    }

    const quotation = await quotationService.updateQuotation(
      req.params.id,
      parsed.data
    );
    res.status(200).json({
      success: true,
      message: 'Quotation updated successfully',
      data: quotation,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update quotation status (open <-> rejected)
// @route   PATCH /api/quotations/:id/status
// @access  Protected
const updateQuotationStatus = async (req, res, next) => {
  try {
    const parsed = quotationStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Validation error',
        errors: parsed.error.errors,
      });
    }

    const quotation = await quotationService.updateQuotationStatus(
      req.params.id,
      parsed.data.status
    );
    res.status(200).json({
      success: true,
      message: `Quotation marked as ${parsed.data.status}`,
      data: quotation,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createQuotation,
  getQuotations,
  getQuotationById,
  updateQuotation,
  updateQuotationStatus,
};

