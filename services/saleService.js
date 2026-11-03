const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Quotation = require('../models/Quotation');
const Settings = require('../models/Settings');
const StockMovement = require('../models/StockMovement');
const LedgerEntry = require('../models/LedgerEntry');
const { generateInvoiceNo } = require('../utils/counter');
const { calculateGstTotals } = require('../utils/gst');
const { round, roundBaseQty } = require('../utils/money');
const customerService = require('./customerService');

const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

/**
 * Creates a sales invoice in a single MongoDB transaction.
 *
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const createSale = async (data) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 0. If converting from quotation, validate it exists and is open
    let quotation = null;
    if (data.quotationId) {
      quotation = await Quotation.findById(data.quotationId).session(session);
      if (!quotation) {
        throw new Error('Quotation not found');
      }
      if (quotation.status !== 'open') {
        throw new Error(`Quotation is already ${quotation.status} and cannot be converted`);
      }
    }

    // 1. Validate Customer
    const customer = await Customer.findById(data.customerId).session(session);
    if (!customer) {
      throw new Error('Customer not found');
    }
    if (!customer.isActive) {
      throw new Error(`Customer "${customer.name}" is inactive/archived`);
    }

    // 2. Fetch business settings to determine business state for GST
    const settings = await Settings.findOne().session(session).lean();
    const businessState = settings?.state || '';

    // 3. Validate products, units, and aggregate required stock by product
    const productDocsMap = new Map();
    const productStockNeeded = new Map();
    const rawItems = [];

    for (const item of data.items) {
      const prodIdStr = item.productId.toString();
      let product = productDocsMap.get(prodIdStr);

      if (!product) {
        product = await Product.findById(item.productId).session(session);
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        if (!product.isActive) {
          throw new Error(`Product "${product.name}" is inactive/archived`);
        }
        productDocsMap.set(prodIdStr, product);
        productStockNeeded.set(prodIdStr, 0);
      }

      // Find unit on product
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
      productStockNeeded.set(
        prodIdStr,
        round(productStockNeeded.get(prodIdStr) + baseQty, 4)
      );

      const gstRate = item.gstRate !== undefined ? Number(item.gstRate) : product.gstRate;

      rawItems.push({
        product: product._id,
        productName: product.name,
        hsn: product.hsn || '',
        unit: item.unit,
        factor,
        quantity,
        rate,
        baseQty,
        gstRate,
      });
    }

    // 4. Stock validation: Check aggregated quantities against available stock
    for (const [prodIdStr, neededBaseQty] of productStockNeeded.entries()) {
      const product = productDocsMap.get(prodIdStr);
      if (neededBaseQty > product.currentStock) {
        throw new Error(
          `Insufficient stock for "${product.name}". Required: ${neededBaseQty} ${product.baseUnit}, Available: ${product.currentStock} ${product.baseUnit}.`
        );
      }
    }

    // 5. Calculate GST breakdown
    const gstCalc = calculateGstTotals({
      items: rawItems,
      customerState: customer.state,
      businessState,
    });

    const subtotal = gstCalc.subtotal;
    const cgst = gstCalc.cgst;
    const sgst = gstCalc.sgst;
    const igst = gstCalc.igst;
    const grandTotal = gstCalc.grandTotal;
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

    // 6. Generate invoice number
    const invoiceNo = await generateInvoiceNo(session);
    const saleDate = data.date ? new Date(data.date) : new Date();

    // 7. Deduct stock and prepare StockMovements
    const stockMovements = [];

    // First update the product documents in database
    for (const [prodIdStr, neededBaseQty] of productStockNeeded.entries()) {
      const product = productDocsMap.get(prodIdStr);
      product.currentStock = round(product.currentStock - neededBaseQty, 4);
      await product.save({ session });
    }

    // Track running stock after movement for each individual line item
    // Group line items and record stock movement
    for (const item of gstCalc.items) {
      const product = productDocsMap.get(item.product.toString());
      stockMovements.push({
        product: item.product,
        type: 'sale',
        baseQty: -item.baseQty,
        stockAfter: product.currentStock,
        rate: item.rate,
        refType: 'sale',
        refId: invoiceNo,
        note: `Sale Invoice ${invoiceNo}`,
        date: saleDate,
      });
    }

    if (stockMovements.length > 0) {
      await StockMovement.insertMany(stockMovements, { session });
    }

    // 8. Create Sale document
    const customerSnapshot = {
      name: customer.name,
      phone: customer.phone || '',
      address: customer.address || '',
      state: customer.state || '',
      gstin: customer.gstin || '',
    };

    const [sale] = await Sale.create(
      [
        {
          invoiceNo,
          date: saleDate,
          customer: customer._id,
          customerSnapshot,
          items: gstCalc.items.map((it) => ({
            product: it.product,
            productName: it.productName,
            hsn: it.hsn,
            unit: it.unit,
            factor: it.factor,
            quantity: it.quantity,
            rate: it.rate,
            baseQty: it.baseQty,
            gstRate: it.gstRate,
            taxableAmount: it.taxableAmount,
            gstAmount: it.gstAmount,
            amount: it.amount,
          })),
          subtotal,
          cgst,
          sgst,
          igst,
          grandTotal,
          paidAmount,
          dueAmount,
          paymentMode: data.paymentMode || 'Cash',
          notes: data.notes || '',
        },
      ],
      { session }
    );

    // 9. Customer Ledger: DEBIT for grandTotal and CREDIT for paidAmount if > 0
    // Get true current balance mathematically (Opening + Debits - Credits)
    const currentCustomerBalance = await customerService.calculateCustomerBalance(
      customer._id,
      session
    );

    // DEBIT: Sale increases what the customer owes us (or reduces advance)
    let runningBalance = round(currentCustomerBalance + grandTotal, 2);

    await LedgerEntry.create(
      [
        {
          partyType: 'customer',
          partyId: customer._id,
          date: saleDate,
          type: 'debit',
          amount: grandTotal,
          refType: 'sale',
          refId: sale._id,
          narration: `Sale Invoice ${invoiceNo}`,
          balanceAfter: runningBalance,
        },
      ],
      { session }
    );

    if (paidAmount > 0) {
      // CREDIT: Payment reduces what the customer owes us
      runningBalance = round(runningBalance - paidAmount, 2);
      await LedgerEntry.create(
        [
          {
            partyType: 'customer',
            partyId: customer._id,
            date: new Date(saleDate.getTime() + 10),
            type: 'credit',
            amount: paidAmount,
            refType: 'payment',
            refId: sale._id,
            narration: `Payment received for ${invoiceNo} via ${data.paymentMode || 'Cash'}`,
            balanceAfter: runningBalance,
          },
        ],
        { session }
      );
    }

    // Reconcile customer sales invoices with payments & available advance credit
    await customerService.reconcileCustomerInvoices(customer._id, session);

    // If converting from quotation, mark quotation as converted and set saleId
    if (quotation) {
      quotation.status = 'converted';
      quotation.saleId = sale._id;
      await quotation.save({ session });
    }

    await session.commitTransaction();

    const refreshedSale = await Sale.findById(sale._id).lean();
    return refreshedSale || sale;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Get sales list with pagination and search.
 */
const getSales = async ({ search = '', page = 1, limit = 20 }) => {
  const query = {};

  if (search && search.trim()) {
    const reg = new RegExp(escapeRegex(search.trim()), 'i');
    query.$or = [
      { invoiceNo: reg },
      { 'customerSnapshot.name': reg },
      { 'customerSnapshot.phone': reg },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [sales, total] = await Promise.all([
    Sale.find(query).sort({ createdAt: -1, date: -1 }).skip(skip).limit(limitNum).lean(),
    Sale.countDocuments(query),
  ]);

  return {
    data: sales,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Get single sale by ID.
 */
const getSaleById = async (id) => {
  const sale = await Sale.findById(id).lean();
  if (!sale) {
    throw new Error('Invoice not found');
  }
  return sale;
};

module.exports = {
  createSale,
  getSales,
  getSaleById,
};
