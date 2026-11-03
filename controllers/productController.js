const mongoose = require('mongoose');
const Product = require('../models/Product');
const {
  productInputSchema,
  updateUnitsSchema,
} = require('../validators/productValidator');

// Helper to escape regex special characters
const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

// @desc    Get all products with search, filter, and pagination
// @route   GET /api/products
// @access  Protected
const getProducts = async (req, res, next) => {
  try {
    const { search, category, status, page = 1, limit = 20 } = req.query;

    const query = {};

    // Filter by active / archived status
    if (status === 'archived') {
      query.isActive = false;
    } else if (status === 'all') {
      // Include both active and archived
    } else {
      // Default to active only
      query.isActive = true;
    }

    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }

    // Name search (case-insensitive substring)
    if (search && search.trim()) {
      query.name = { $regex: escapeRegex(search.trim()), $options: 'i' };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [products, total, categories] = await Promise.all([
      Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Product.countDocuments(query),
      Product.distinct('category'),
    ]);

    res.status(200).json({
      success: true,
      data: products,
      categories: categories.sort(),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Protected
const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new product
// @route   POST /api/products
// @access  Protected
const createProduct = async (req, res, next) => {
  try {
    const parseResult = productInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation error',
        errors: parseResult.error.errors,
      });
    }

    const data = parseResult.data;

    // Check duplicate name (case-insensitive)
    const existing = await Product.findOne({
      name: { $regex: `^${escapeRegex(data.name)}$`, $options: 'i' },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `A product with the name "${data.name}" already exists`,
      });
    }

    // Ensure inventory metrics are initialized safely to default (read-only)
    const product = await Product.create({
      name: data.name,
      category: data.category,
      hsn: data.hsn,
      gstRate: data.gstRate,
      baseUnit: data.baseUnit,
      units: data.units,
      minStock: data.minStock,
      isActive: data.isActive !== undefined ? data.isActive : true,
      currentStock: 0,
      avgCost: 0,
      lastPurchaseRate: 0,
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A product with this name already exists',
      });
    }
    next(error);
  }
};

// @desc    Update product details
// @route   PUT /api/products/:id
// @access  Protected
const updateProduct = async (req, res, next) => {
  try {
    const existingProduct = await Product.findById(req.params.id);
    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const parseResult = productInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation error',
        errors: parseResult.error.errors,
      });
    }

    const data = parseResult.data;

    // Check name uniqueness if changed
    const duplicate = await Product.findOne({
      _id: { $ne: existingProduct._id },
      name: { $regex: `^${escapeRegex(data.name)}$`, $options: 'i' },
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: `Another product with the name "${data.name}" already exists`,
      });
    }

    // Block changing baseUnit or factors if product already has stock movements
    let hasMovements = false;

    // Check Phase 3 StockMovement model if it exists
    if (mongoose.models.StockMovement) {
      const movementCount = await mongoose.models.StockMovement.countDocuments({
        product: existingProduct._id,
      });
      if (movementCount > 0) hasMovements = true;
    }

    // Also check currentStock or purchase history
    if (existingProduct.currentStock !== 0 || existingProduct.lastPurchaseRate !== 0) {
      hasMovements = true;
    }

    if (hasMovements) {
      // 1. Check if baseUnit was changed
      if (existingProduct.baseUnit.toLowerCase() !== data.baseUnit.toLowerCase()) {
        return res.status(400).json({
          success: false,
          message:
            'Cannot modify the base unit because this product already has recorded stock transactions.',
        });
      }

      // 2. Base unit entry must be present and its factor must stay 1
      const normalizedBase = existingProduct.baseUnit.toLowerCase();
      const baseEntry = data.units.find(
        (u) => u.name.trim().toLowerCase() === normalizedBase
      );
      if (!baseEntry || Number(baseEntry.factor) !== 1) {
        return res.status(400).json({
          success: false,
          message: `The base unit "${existingProduct.baseUnit}" entry cannot be removed or have its factor altered.`,
        });
      }
    }

    // Update mutable fields (currentStock, avgCost, lastPurchaseRate remain untouched)
    existingProduct.name = data.name;
    existingProduct.category = data.category;
    existingProduct.hsn = data.hsn;
    existingProduct.gstRate = data.gstRate;
    existingProduct.baseUnit = data.baseUnit;
    existingProduct.units = data.units;
    existingProduct.minStock = data.minStock;
    if (data.isActive !== undefined) {
      existingProduct.isActive = data.isActive;
    }

    await existingProduct.save();

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: existingProduct,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A product with this name already exists',
      });
    }
    next(error);
  }
};

// @desc    Toggle product active status (archive / restore)
// @route   PATCH /api/products/:id/status
// @access  Protected
const toggleProductStatus = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    if (typeof req.body.isActive === 'boolean') {
      product.isActive = req.body.isActive;
    } else {
      product.isActive = !product.isActive;
    }

    await product.save();

    res.status(200).json({
      success: true,
      message: product.isActive ? 'Product restored successfully' : 'Product archived successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Search active products by name with units and selling prices
// @route   GET /api/products/search?q=
// @access  Protected
const searchProducts = async (req, res, next) => {
  try {
    const q = req.query.q || '';
    const query = { isActive: true };

    if (q.trim()) {
      query.name = { $regex: escapeRegex(q.trim()), $options: 'i' };
    }

    const products = await Product.find(query)
      .select('name category hsn gstRate baseUnit units currentStock avgCost lastPurchaseRate')
      .sort({ name: 1 })
      .limit(50)
      .lean();

    res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update product units (add, edit, or remove selling units)
// @route   PATCH /api/products/:id/units
// @access  Protected
const updateProductUnits = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const parseResult = updateUnitsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation error',
        errors: parseResult.error.errors,
      });
    }

    const { units } = parseResult.data;
    const normalizedBase = product.baseUnit.trim().toLowerCase();

    // Check that baseUnit is present in units and its factor is 1
    const baseEntry = units.find(
      (u) => u.name.trim().toLowerCase() === normalizedBase
    );
    if (!baseEntry) {
      return res.status(400).json({
        success: false,
        message: `Units list must include the base unit "${product.baseUnit}".`,
      });
    }
    if (Number(baseEntry.factor) !== 1) {
      return res.status(400).json({
        success: false,
        message: `The base unit "${product.baseUnit}" conversion factor must be exactly 1.`,
      });
    }

    // Check duplicate names
    const unitNames = units.map((u) => u.name.trim().toLowerCase());
    if (new Set(unitNames).size !== unitNames.length) {
      return res.status(400).json({
        success: false,
        message: 'Unit names must be unique within a product.',
      });
    }

    // Update units only - leaves stock, avgCost, lastPurchaseRate, name, etc. untouched
    product.units = units;
    await product.save();

    res.status(200).json({
      success: true,
      message: 'Product units updated successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductUnits,
  toggleProductStatus,
  searchProducts,
};

