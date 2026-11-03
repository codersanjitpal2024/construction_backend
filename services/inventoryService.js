const mongoose = require('mongoose');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const { round } = require('../utils/money');

/**
 * Get inventory items with valuation, low-stock flags, and filters.
 */
const getInventory = async ({
  search,
  category,
  lowStockOnly,
  page = 1,
  limit = 20,
}) => {
  const query = { isActive: true };

  if (category && category !== 'all') {
    query.category = category;
  }

  if (search && search.trim()) {
    const reg = new RegExp(
      search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'),
      'i'
    );
    query.$or = [{ name: reg }, { hsn: reg }];
  }

  // If lowStockOnly: currentStock <= minStock
  if (lowStockOnly === true || lowStockOnly === 'true') {
    query.$expr = { $lte: ['$currentStock', '$minStock'] };
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [products, total] = await Promise.all([
    Product.find(query).sort({ currentStock: 1, name: 1 }).skip(skip).limit(limitNum).lean(),
    Product.countDocuments(query),
  ]);

  const items = products.map((prod) => {
    const currentStock = Number(prod.currentStock) || 0;
    const avgCost = Number(prod.avgCost) || 0;
    const minStock = Number(prod.minStock) || 0;
    const stockValue = round(currentStock * avgCost, 2);
    const isLowStock = currentStock <= minStock;

    return {
      _id: prod._id,
      name: prod.name,
      category: prod.category,
      hsn: prod.hsn,
      baseUnit: prod.baseUnit,
      units: prod.units,
      currentStock,
      avgCost,
      lastPurchaseRate: prod.lastPurchaseRate || 0,
      minStock,
      stockValue,
      isLowStock,
      status: currentStock <= 0 ? 'out_of_stock' : isLowStock ? 'low_stock' : 'in_stock',
    };
  });

  return {
    data: items,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Get paginated stock movements for a product.
 */
const getProductMovements = async (productId, page = 1, limit = 20) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query = { product: productId };

  const [movements, total, product] = await Promise.all([
    StockMovement.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    StockMovement.countDocuments(query),
    Product.findById(productId).select('name baseUnit currentStock minStock').lean(),
  ]);

  if (!product) {
    throw new Error('Product not found');
  }

  return {
    product,
    data: movements,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Adjust product stock in a MongoDB transaction.
 */
const adjustStock = async (productId, { newQty, delta, reason }) => {
  if (!reason || !reason.trim()) {
    throw new Error('A reason is required for stock adjustment');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(productId).session(session);
    if (!product) {
      throw new Error('Product not found');
    }

    const oldStock = Number(product.currentStock) || 0;
    let finalStock;
    let signedDelta;

    if (newQty !== undefined) {
      finalStock = round(Number(newQty), 4);
      signedDelta = round(finalStock - oldStock, 4);
    } else if (delta !== undefined) {
      signedDelta = round(Number(delta), 4);
      finalStock = round(oldStock + signedDelta, 4);
    } else {
      throw new Error('Either newQty or delta must be provided');
    }

    if (finalStock < 0) {
      throw new Error(
        `Adjusted stock cannot be negative (attempted: ${finalStock} ${product.baseUnit})`
      );
    }

    product.currentStock = finalStock;
    if (finalStock === 0) {
      product.avgCost = 0;
    }

    await product.save({ session });

    const [movement] = await StockMovement.create(
      [
        {
          product: product._id,
          type: 'adjustment',
          baseQty: signedDelta,
          stockAfter: finalStock,
          rate: product.avgCost || 0,
          refType: 'adjustment',
          refId: null,
          note: reason.trim(),
          date: new Date(),
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return {
      product,
      movement,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  getInventory,
  getProductMovements,
  adjustStock,
};

