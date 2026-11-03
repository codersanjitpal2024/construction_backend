const Quotation = require('../models/Quotation');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Settings = require('../models/Settings');
const { generateQuotationNo } = require('../utils/counter');
const { calculateGstTotals } = require('../utils/gst');
const { round, roundBaseQty } = require('../utils/money');

const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

/**
 * Creates a quotation.
 * Does NOT check stock or alter stock / ledgers.
 *
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const createQuotation = async (data) => {
  // 1. Validate Customer
  const customer = await Customer.findById(data.customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }
  if (!customer.isActive) {
    throw new Error(`Customer "${customer.name}" is inactive/archived`);
  }

  // 2. Fetch business settings for GST state comparison
  const settings = await Settings.findOne().lean();
  const businessState = settings?.state || '';

  // 3. Validate products & units
  const rawItems = [];

  for (const item of data.items) {
    const product = await Product.findById(item.productId);
    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }
    if (!product.isActive) {
      throw new Error(`Product "${product.name}" is inactive/archived`);
    }

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
    const gstRate =
      item.gstRate !== undefined ? Number(item.gstRate) : product.gstRate;

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

  // 4. Calculate GST breakdown reusing the identical formula as sales
  const gstCalc = calculateGstTotals({
    items: rawItems,
    customerState: customer.state,
    businessState,
  });

  // 5. Generate Quotation document
  const quotationNo = await generateQuotationNo();
  const quotationDate = data.date ? new Date(data.date) : new Date();
  const validUntil = data.validUntil
    ? new Date(data.validUntil)
    : new Date(quotationDate.getTime() + 15 * 24 * 60 * 60 * 1000);

  const customerSnapshot = {
    name: customer.name,
    phone: customer.phone || '',
    address: customer.address || '',
    state: customer.state || '',
    gstin: customer.gstin || '',
  };

  const quotation = await Quotation.create({
    quotationNo,
    date: quotationDate,
    validUntil,
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
    subtotal: gstCalc.subtotal,
    cgst: gstCalc.cgst,
    sgst: gstCalc.sgst,
    igst: gstCalc.igst,
    grandTotal: gstCalc.grandTotal,
    notes: data.notes || '',
    status: 'open',
  });

  return quotation;
};

/**
 * Get paginated list of quotations
 *
 * @param {Object} queryParams
 * @returns {Promise<Object>}
 */
const getQuotations = async (queryParams = {}) => {
  const page = Math.max(1, parseInt(queryParams.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};

  if (queryParams.status) {
    filter.status = queryParams.status;
  }

  if (queryParams.search && queryParams.search.trim()) {
    const q = escapeRegex(queryParams.search.trim());
    filter.$or = [
      { quotationNo: { $regex: q, $options: 'i' } },
      { 'customerSnapshot.name': { $regex: q, $options: 'i' } },
    ];
  }

  const [data, total] = await Promise.all([
    Quotation.find(filter)
      .populate('saleId', 'invoiceNo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Quotation.countDocuments(filter),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Get single quotation by ID
 *
 * @param {string} id
 * @returns {Promise<Object>}
 */
const getQuotationById = async (id) => {
  const quotation = await Quotation.findById(id)
    .populate('customer', 'name phone address state gstin')
    .populate('saleId', 'invoiceNo date grandTotal')
    .lean();

  if (!quotation) {
    throw new Error('Quotation not found');
  }

  return quotation;
};

/**
 * Updates an open quotation
 *
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const updateQuotation = async (id, data) => {
  const quotation = await Quotation.findById(id);
  if (!quotation) {
    throw new Error('Quotation not found');
  }

  if (quotation.status !== 'open') {
    throw new Error(`Cannot edit quotation: quotation status is "${quotation.status}"`);
  }

  // 1. Validate customer
  const customer = await Customer.findById(data.customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }
  if (!customer.isActive) {
    throw new Error(`Customer "${customer.name}" is inactive/archived`);
  }

  // 2. Fetch business settings
  const settings = await Settings.findOne().lean();
  const businessState = settings?.state || '';

  // 3. Validate items
  const rawItems = [];

  for (const item of data.items) {
    const product = await Product.findById(item.productId);
    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }
    if (!product.isActive) {
      throw new Error(`Product "${product.name}" is inactive/archived`);
    }

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
    const gstRate =
      item.gstRate !== undefined ? Number(item.gstRate) : product.gstRate;

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

  const gstCalc = calculateGstTotals({
    items: rawItems,
    customerState: customer.state,
    businessState,
  });

  const quotationDate = data.date ? new Date(data.date) : quotation.date;
  const validUntil = data.validUntil
    ? new Date(data.validUntil)
    : quotation.validUntil;

  quotation.customer = customer._id;
  quotation.customerSnapshot = {
    name: customer.name,
    phone: customer.phone || '',
    address: customer.address || '',
    state: customer.state || '',
    gstin: customer.gstin || '',
  };
  quotation.date = quotationDate;
  quotation.validUntil = validUntil;
  quotation.items = gstCalc.items.map((it) => ({
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
  }));
  quotation.subtotal = gstCalc.subtotal;
  quotation.cgst = gstCalc.cgst;
  quotation.sgst = gstCalc.sgst;
  quotation.igst = gstCalc.igst;
  quotation.grandTotal = gstCalc.grandTotal;
  quotation.notes = data.notes !== undefined ? data.notes : quotation.notes;

  await quotation.save();
  return quotation;
};

/**
 * Update quotation status: open -> rejected or rejected -> open
 *
 * @param {string} id
 * @param {string} newStatus
 * @returns {Promise<Object>}
 */
const updateQuotationStatus = async (id, newStatus) => {
  const quotation = await Quotation.findById(id);
  if (!quotation) {
    throw new Error('Quotation not found');
  }

  if (quotation.status === 'converted') {
    throw new Error(
      'Cannot change status: quotation has already been converted to an invoice'
    );
  }

  const isAllowed =
    (quotation.status === 'open' && newStatus === 'rejected') ||
    (quotation.status === 'rejected' && newStatus === 'open');

  if (!isAllowed) {
    throw new Error(
      `Cannot change status from "${quotation.status}" to "${newStatus}". Allowed transitions: open <-> rejected.`
    );
  }

  quotation.status = newStatus;
  await quotation.save();
  return quotation;
};

module.exports = {
  createQuotation,
  getQuotations,
  getQuotationById,
  updateQuotation,
  updateQuotationStatus,
};

