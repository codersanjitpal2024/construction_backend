const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const StockMovement = require('../models/StockMovement');
const LedgerEntry = require('../models/LedgerEntry');
const { generatePurchaseNo } = require('../utils/counter');
const { round, roundBaseQty } = require('../utils/money');

/**
 * Creates a purchase in a single MongoDB transaction.
 *
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const createPurchase = async (data) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Validate Supplier
    const supplier = await Supplier.findById(data.supplierId).session(session);
    if (!supplier) {
      throw new Error('Supplier not found');
    }
    if (!supplier.isActive) {
      throw new Error(`Supplier "${supplier.name}" is archived/inactive`);
    }

    // 2. Validate and prepare line items
    const processedItems = [];
    let calculatedSubtotal = 0;
    let calculatedGstTotal = 0;

    for (const item of data.items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }
      if (!product.isActive) {
        throw new Error(`Product "${product.name}" is archived/inactive`);
      }

      // Check entered unit exists in product.units
      const productUnit = product.units.find(
        (u) => u.name.toLowerCase() === item.unit.toLowerCase()
      );

      if (!productUnit) {
        throw new Error(
          `Unit "${item.unit}" is not configured for product "${product.name}"`
        );
      }

      const factor = Number(productUnit.factor);
      const quantity = Number(item.quantity);
      const rate = Number(item.rate);

      if (quantity <= 0) {
        throw new Error(`Quantity for "${product.name}" must be greater than 0`);
      }
      if (rate < 0) {
        throw new Error(`Rate for "${product.name}" cannot be negative`);
      }

      const baseQty = roundBaseQty(quantity * factor);
      const ratePerBaseUnit = round(rate / factor, 4);
      const itemAmount = round(quantity * rate, 2);
      const gstRate = item.gstRate !== undefined ? Number(item.gstRate) : product.gstRate;
      const gstAmount = round((itemAmount * gstRate) / 100, 2);

      calculatedSubtotal = round(calculatedSubtotal + itemAmount, 2);
      calculatedGstTotal = round(calculatedGstTotal + gstAmount, 2);

      processedItems.push({
        product: product._id,
        productDoc: product, // for stock updating later
        productName: product.name,
        hsn: product.hsn || '',
        gstRate,
        unit: item.unit,
        factor,
        quantity,
        rate,
        baseQty,
        ratePerBaseUnit,
        amount: itemAmount,
        gstAmount,
      });
    }

    const grandTotal = round(calculatedSubtotal + calculatedGstTotal, 2);
    const paidAmount = round(data.paidAmount || 0, 2);

    if (paidAmount < 0) {
      throw new Error('Paid amount cannot be negative');
    }
    if (paidAmount > grandTotal) {
      throw new Error(
        `Paid amount (₹${paidAmount}) cannot exceed grand total (₹${grandTotal})`
      );
    }

    const dueAmount = round(grandTotal - paidAmount, 2);

    // 3. Generate Purchase Number (PUR-YYYY-0001)
    const purchaseDate = data.date ? new Date(data.date) : new Date();
    const purchaseNo = await generatePurchaseNo(session, purchaseDate);

    // 4. Create the Purchase document
    const purchaseItemsPayload = processedItems.map((pi) => ({
      product: pi.product,
      productName: pi.productName,
      hsn: pi.hsn,
      gstRate: pi.gstRate,
      unit: pi.unit,
      factor: pi.factor,
      quantity: pi.quantity,
      rate: pi.rate,
      baseQty: pi.baseQty,
      amount: pi.amount,
    }));

    const [purchase] = await Purchase.create(
      [
        {
          purchaseNo,
          supplier: supplier._id,
          date: purchaseDate,
          supplierInvoiceNo: data.supplierInvoiceNo || '',
          items: purchaseItemsPayload,
          subtotal: calculatedSubtotal,
          gstTotal: calculatedGstTotal,
          grandTotal,
          paidAmount,
          dueAmount,
          paymentMode: data.paymentMode || '',
          notes: data.notes || '',
          status: 'active',
        },
      ],
      { session }
    );

    // 5. Update stock and avgCost for each product, and create StockMovement
    for (const item of processedItems) {
      const product = item.productDoc;
      const oldStock = Number(product.currentStock) || 0;
      const oldAvg = Number(product.avgCost) || 0;
      const newStock = round(oldStock + item.baseQty, 4);

      // Weighted average cost formula (GST-exclusive, per base unit)
      let newAvg = 0;
      if (newStock > 0) {
        newAvg = round(
          (oldStock * oldAvg + item.baseQty * item.ratePerBaseUnit) / newStock,
          2
        );
      }

      product.currentStock = newStock;
      product.avgCost = newAvg;
      product.lastPurchaseRate = item.ratePerBaseUnit;

      await product.save({ session });

      // Create StockMovement
      await StockMovement.create(
        [
          {
            product: product._id,
            type: 'purchase',
            baseQty: item.baseQty,
            stockAfter: newStock,
            rate: item.ratePerBaseUnit,
            refType: 'purchase',
            refId: purchase._id,
            note: `Purchase invoice ${purchase.purchaseNo}`,
            date: purchaseDate,
          },
        ],
        { session }
      );
    }

    // 6. Supplier Ledger Handling
    // Rule: if supplier has openingBalance and no ledger entries yet, create opening entry first
    const entryCount = await LedgerEntry.countDocuments({
      partyType: 'supplier',
      partyId: supplier._id,
    }).session(session);

    let lastBalance = 0;

    if (entryCount === 0 && Number(supplier.openingBalance) !== 0) {
      lastBalance = round(supplier.openingBalance, 2);
      await LedgerEntry.create(
        [
          {
            partyType: 'supplier',
            partyId: supplier._id,
            date: supplier.createdAt || purchaseDate,
            type: supplier.openingBalance >= 0 ? 'credit' : 'debit',
            amount: Math.abs(supplier.openingBalance),
            refType: 'opening',
            refId: supplier._id,
            narration: 'Opening balance',
            balanceAfter: lastBalance,
          },
        ],
        { session }
      );
    } else {
      const lastEntry = await LedgerEntry.findOne({
        partyType: 'supplier',
        partyId: supplier._id,
      })
        .sort({ date: -1, createdAt: -1 })
        .session(session);

      lastBalance = lastEntry
        ? lastEntry.balanceAfter
        : round(supplier.openingBalance || 0, 2);
    }

    // Credit entry for grandTotal
    const creditBalance = round(lastBalance + grandTotal, 2);
    await LedgerEntry.create(
      [
        {
          partyType: 'supplier',
          partyId: supplier._id,
          date: purchaseDate,
          type: 'credit',
          amount: grandTotal,
          refType: 'purchase',
          refId: purchase._id,
          narration: `Purchase invoice ${purchase.purchaseNo}`,
          balanceAfter: creditBalance,
        },
      ],
      { session }
    );

    // If paidAmount > 0, debit entry for paidAmount
    if (paidAmount > 0) {
      const paymentBalance = round(creditBalance - paidAmount, 2);
      await LedgerEntry.create(
        [
          {
            partyType: 'supplier',
            partyId: supplier._id,
            date: purchaseDate,
            type: 'debit',
            amount: paidAmount,
            refType: 'payment',
            refId: purchase._id,
            narration: `Payment for purchase ${purchase.purchaseNo} via ${data.paymentMode || 'Cash'}`,
            balanceAfter: paymentBalance,
          },
        ],
        { session }
      );
    }

    const supplierService = require('./supplierService');
    await supplierService.reconcileSupplierPurchases(supplier._id, session);

    await session.commitTransaction();
    const refreshedPurchase = await Purchase.findById(purchase._id).lean();
    return refreshedPurchase || purchase;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Cancels a purchase in a single MongoDB transaction.
 *
 * @param {string} id
 * @param {string} reason
 * @returns {Promise<Object>}
 */
const cancelPurchase = async (id, reason) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const purchase = await Purchase.findById(id).session(session);
    if (!purchase) {
      throw new Error('Purchase not found');
    }
    if (purchase.status !== 'active') {
      throw new Error('Purchase is already cancelled');
    }

    const cancelDate = new Date();

    // 1. Check stock sufficiency before making changes
    for (const item of purchase.items) {
      const product = await Product.findById(item.product).session(session);
      if (!product) {
        throw new Error(`Product not found: ${item.productName}`);
      }

      if (product.currentStock - item.baseQty < 0) {
        throw new Error(
          `Cannot cancel purchase ${purchase.purchaseNo}: insufficient stock for "${product.name}". Current stock is ${product.currentStock} ${product.baseUnit}, but cancellation requires reversing ${item.baseQty} ${product.baseUnit}.`
        );
      }
    }

    // 2. Reverse stock & add StockMovement rows
    for (const item of purchase.items) {
      const product = await Product.findById(item.product).session(session);
      const newStock = round(product.currentStock - item.baseQty, 4);

      product.currentStock = newStock;
      // Rule: Do not recalculate avgCost on cancel (leave unchanged, except set to 0 if stock becomes 0)
      if (newStock === 0) {
        product.avgCost = 0;
      }

      await product.save({ session });

      await StockMovement.create(
        [
          {
            product: product._id,
            type: 'purchase_cancel',
            baseQty: -item.baseQty,
            stockAfter: newStock,
            rate: round(item.rate / item.factor, 4),
            refType: 'purchase_cancel',
            refId: purchase._id,
            note: `Cancellation of purchase ${purchase.purchaseNo}: ${reason}`,
            date: cancelDate,
          },
        ],
        { session }
      );
    }

    // 3. Reversing ledger entries
    const lastEntry = await LedgerEntry.findOne({
      partyType: 'supplier',
      partyId: purchase.supplier,
    })
      .sort({ date: -1, createdAt: -1 })
      .session(session);

    let currentBalance = lastEntry ? lastEntry.balanceAfter : 0;

    // Credit reversal: add debit entry for grandTotal
    currentBalance = round(currentBalance - purchase.grandTotal, 2);
    await LedgerEntry.create(
      [
        {
          partyType: 'supplier',
          partyId: purchase.supplier,
          date: cancelDate,
          type: 'debit',
          amount: purchase.grandTotal,
          refType: 'purchase_cancel',
          refId: purchase._id,
          narration: `Reversal of purchase ${purchase.purchaseNo}: ${reason}`,
          balanceAfter: currentBalance,
        },
      ],
      { session }
    );

    // If paidAmount > 0, debit reversal: add credit entry for paidAmount
    if (purchase.paidAmount > 0) {
      currentBalance = round(currentBalance + purchase.paidAmount, 2);
      await LedgerEntry.create(
        [
          {
            partyType: 'supplier',
            partyId: purchase.supplier,
            date: cancelDate,
            type: 'credit',
            amount: purchase.paidAmount,
            refType: 'purchase_cancel',
            refId: purchase._id,
            narration: `Reversal of payment made for cancelled purchase ${purchase.purchaseNo}`,
            balanceAfter: currentBalance,
          },
        ],
        { session }
      );
    }

    // 4. Update Purchase document status
    purchase.status = 'cancelled';
    purchase.cancelledAt = cancelDate;
    purchase.cancelReason = reason;
    purchase.dueAmount = 0;
    await purchase.save({ session });

    const supplierService = require('./supplierService');
    await supplierService.reconcileSupplierPurchases(purchase.supplier, session);

    await session.commitTransaction();
    return purchase;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Get purchases with filtering, search, and pagination.
 */
const getPurchases = async ({
  supplierId,
  status,
  search,
  startDate,
  endDate,
  page = 1,
  limit = 20,
}) => {
  const query = {};

  if (supplierId && supplierId !== 'all') {
    query.supplier = supplierId;
  }

  if (status && status !== 'all') {
    query.status = status;
  }

  if (search && search.trim()) {
    query.purchaseNo = { $regex: search.trim(), $options: 'i' };
  }

  if (startDate || endDate) {
    query.date = {};
    if (startDate) {
      query.date.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.date.$lte = end;
    }
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [purchases, total] = await Promise.all([
    Purchase.find(query)
      .populate('supplier', 'name phone gstin')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Purchase.countDocuments(query),
  ]);

  return {
    data: purchases,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Get a single purchase by ID.
 */
const getPurchaseById = async (id) => {
  const purchase = await Purchase.findById(id)
    .populate('supplier', 'name phone email address gstin')
    .lean();

  if (!purchase) {
    throw new Error('Purchase not found');
  }

  return purchase;
};

module.exports = {
  createPurchase,
  cancelPurchase,
  getPurchases,
  getPurchaseById,
};

