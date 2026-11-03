const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const LedgerEntry = require('../models/LedgerEntry');
const Sale = require('../models/Sale');
const { round } = require('../utils/money');

const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

/**
 * Create a new customer.
 */
const createCustomer = async (data) => {
  const customer = await Customer.create({
    name: data.name,
    phone: data.phone || '',
    address: data.address || '',
    state: data.state || '',
    gstin: data.gstin ? data.gstin.toUpperCase() : '',
    openingBalance: round(data.openingBalance || 0, 2),
    isActive: data.isActive !== undefined ? data.isActive : true,
  });

  return customer;
};

/**
 * Update customer details.
 */
const updateCustomer = async (id, data) => {
  const customer = await Customer.findById(id);
  if (!customer) {
    throw new Error('Customer not found');
  }

  if (data.name !== undefined) customer.name = data.name;
  if (data.phone !== undefined) customer.phone = data.phone;
  if (data.address !== undefined) customer.address = data.address;
  if (data.state !== undefined) customer.state = data.state;
  if (data.gstin !== undefined) customer.gstin = data.gstin.toUpperCase();
  if (data.isActive !== undefined) customer.isActive = data.isActive;

  await customer.save();
  return customer;
};

/**
 * Calculates current customer balance mathematically:
 * Current Balance = Opening Balance + Sum(Debits) - Sum(Credits)
 * Positive balance = Customer owes us (Receivable)
 * Negative balance = Customer has advance credit
 */
const calculateCustomerBalance = async (customerId, session = null) => {
  const customer = await Customer.findById(customerId).session(session).lean();
  if (!customer) return 0;

  const match = {
    partyType: 'customer',
    partyId: new mongoose.Types.ObjectId(customerId),
  };

  const agg = LedgerEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalDebit: {
          $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] },
        },
        totalCredit: {
          $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] },
        },
      },
    },
  ]);

  if (session) {
    agg.session(session);
  }

  const result = await agg;
  const opening = customer.openingBalance || 0;
  if (!result || result.length === 0) {
    return round(opening, 2);
  }

  const { totalDebit, totalCredit } = result[0];
  return round(opening + totalDebit - totalCredit, 2);
};

/**
 * Get all customers with search and current balances.
 */
const getCustomers = async ({ search = '', status = 'active', page = 1, limit = 50 }) => {
  const query = {};

  if (status === 'archived') {
    query.isActive = false;
  } else if (status === 'all') {
    // Both active and archived
  } else {
    query.isActive = true;
  }

  if (search && search.trim()) {
    const reg = new RegExp(escapeRegex(search.trim()), 'i');
    query.$or = [{ name: reg }, { phone: reg }, { gstin: reg }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [customers, total] = await Promise.all([
    Customer.find(query).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
    Customer.countDocuments(query),
  ]);

  const customersWithBalance = await Promise.all(
    customers.map(async (cust) => {
      const currentBalance = await calculateCustomerBalance(cust._id);

      return {
        ...cust,
        currentBalance,
      };
    })
  );

  return {
    data: customersWithBalance,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Get single customer by ID with balance.
 */
const getCustomerById = async (id) => {
  const customer = await Customer.findById(id).lean();
  if (!customer) {
    throw new Error('Customer not found');
  }

  const currentBalance = await calculateCustomerBalance(customer._id);

  return {
    ...customer,
    currentBalance,
  };
};

/**
 * Record a payment from a customer (CREDIT) in a transaction.
 */
const recordCustomerPayment = async (customerId, { amount, paymentMode = 'Cash', date, note = '' }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const customer = await Customer.findById(customerId).session(session);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const payAmount = round(amount, 2);
    if (payAmount <= 0) {
      throw new Error('Payment amount must be greater than 0');
    }

    const paymentDate = date ? new Date(date) : new Date();

    // Check balance inside the transaction
    const lastBalance = await calculateCustomerBalance(customer._id, session);

    // Customer ledger: payment = CREDIT (reduces what they owe us)
    const newBalance = round(lastBalance - payAmount, 2);

    const [entry] = await LedgerEntry.create(
      [
        {
          partyType: 'customer',
          partyId: customer._id,
          date: paymentDate,
          type: 'credit',
          amount: payAmount,
          refType: 'payment',
          refId: null,
          narration: note || `Payment received via ${paymentMode}`,
          balanceAfter: newBalance,
        },
      ],
      { session }
    );

    // Reconcile customer sales invoices with this payment
    await reconcileCustomerInvoices(customer._id, session);

    await session.commitTransaction();

    return {
      success: true,
      entry,
      currentBalance: newBalance,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Reconciles customer payments against sales invoices (FIFO).
 * Matches total customer payments (credits) to sales invoices in chronological order,
 * ensuring Sale.paidAmount and Sale.dueAmount stay in sync with ledger payments & advances.
 */
const reconcileCustomerInvoices = async (customerId, session = null) => {
  const customer = await Customer.findById(customerId).session(session);
  if (!customer) return;

  // 1. Calculate total credits (payments) received from customer
  const match = {
    partyType: 'customer',
    partyId: new mongoose.Types.ObjectId(customerId),
    type: 'credit',
  };

  const agg = LedgerEntry.aggregate([
    { $match: match },
    { $group: { _id: null, totalCredit: { $sum: '$amount' } } },
  ]);
  if (session) agg.session(session);
  const creditRes = await agg;
  const totalPayments = creditRes[0]?.totalCredit || 0;

  // Opening balance adjustment:
  // If openingBalance < 0, customer started with advance credit.
  // If openingBalance > 0, customer started with previous dues to be satisfied first.
  const opening = customer.openingBalance || 0;
  let availablePayment = round(
    totalPayments - (opening > 0 ? opening : 0) + (opening < 0 ? Math.abs(opening) : 0),
    2
  );

  // 2. Fetch all sales for this customer ordered by date ASC, _id ASC (FIFO)
  const salesQuery = Sale.find({ customer: customerId }).sort({ date: 1, createdAt: 1, _id: 1 });
  if (session) salesQuery.session(session);
  const sales = await salesQuery;

  for (const sale of sales) {
    const grandTotal = sale.grandTotal || 0;
    const alloc = Math.max(0, Math.min(grandTotal, availablePayment));
    const due = round(grandTotal - alloc, 2);
    availablePayment = round(availablePayment - alloc, 2);

    if (sale.paidAmount !== alloc || sale.dueAmount !== due) {
      sale.paidAmount = alloc;
      sale.dueAmount = due;
      if (session) {
        await sale.save({ session });
      } else {
        await sale.save();
      }
    }
  }
};

/**
 * Get customer ledger statement with recalculated chronological running balances.
 */
const getCustomerLedger = async (customerId, { page, limit } = {}) => {
  const customer = await Customer.findById(customerId).lean();
  if (!customer) {
    throw new Error('Customer not found');
  }

  // Ensure invoices are reconciled
  await reconcileCustomerInvoices(customer._id);

  // Fetch all entries in chronological order
  const rawEntries = await LedgerEntry.find({
    partyType: 'customer',
    partyId: customer._id,
  })
    .sort({ date: 1, createdAt: 1, _id: 1 })
    .lean();

  let running = round(customer.openingBalance || 0, 2);
  const entriesWithRunning = rawEntries.map((entry) => {
    if (entry.type === 'debit') {
      running = round(running + entry.amount, 2);
    } else {
      running = round(running - entry.amount, 2);
    }
    return {
      ...entry,
      balanceAfter: running,
    };
  });

  // Return newest first for display in table
  const entriesForDisplay = [...entriesWithRunning].reverse();
  const total = entriesForDisplay.length;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10) || 30;
  const pagedEntries = pageNum
    ? entriesForDisplay.slice((pageNum - 1) * limitNum, pageNum * limitNum)
    : entriesForDisplay;

  return {
    customer: {
      ...customer,
      currentBalance: running,
    },
    entries: pagedEntries,
    pagination: {
      total,
      page: pageNum || 1,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

module.exports = {
  createCustomer,
  updateCustomer,
  getCustomers,
  getCustomerById,
  calculateCustomerBalance,
  recordCustomerPayment,
  reconcileCustomerInvoices,
  getCustomerLedger,
};
