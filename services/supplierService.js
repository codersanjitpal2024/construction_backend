const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const LedgerEntry = require('../models/LedgerEntry');
const Purchase = require('../models/Purchase');
const { round } = require('../utils/money');

/**
 * Create a new supplier.
 */
const createSupplier = async (data) => {
  const supplier = await Supplier.create({
    name: data.name,
    phone: data.phone || '',
    email: data.email || '',
    address: data.address || '',
    state: data.state || '',
    gstin: data.gstin ? data.gstin.toUpperCase() : '',
    openingBalance: round(data.openingBalance || 0, 2),
    isActive: data.isActive !== undefined ? data.isActive : true,
  });

  return supplier;
};

/**
 * Update supplier details.
 */
const updateSupplier = async (id, data) => {
  const supplier = await Supplier.findById(id);
  if (!supplier) {
    throw new Error('Supplier not found');
  }

  // If opening balance changed, verify if ledger entries already exist
  if (data.openingBalance !== undefined && data.openingBalance !== supplier.openingBalance) {
    const entryCount = await LedgerEntry.countDocuments({
      partyType: 'supplier',
      partyId: supplier._id,
    });
    if (entryCount > 0) {
      throw new Error(
        'Cannot modify opening balance after ledger transactions have been recorded'
      );
    }
    supplier.openingBalance = round(data.openingBalance, 2);
  }

  supplier.name = data.name !== undefined ? data.name : supplier.name;
  supplier.phone = data.phone !== undefined ? data.phone : supplier.phone;
  supplier.email = data.email !== undefined ? data.email : supplier.email;
  supplier.address = data.address !== undefined ? data.address : supplier.address;
  supplier.state = data.state !== undefined ? data.state : supplier.state;
  if (data.gstin !== undefined) {
    supplier.gstin = data.gstin.toUpperCase();
  }
  if (data.isActive !== undefined) {
    supplier.isActive = data.isActive;
  }

  await supplier.save();
  return supplier;
};

/**
 * Toggle supplier active/archived status.
 */
const toggleSupplierStatus = async (id, isActive) => {
  const supplier = await Supplier.findById(id);
  if (!supplier) {
    throw new Error('Supplier not found');
  }

  supplier.isActive = typeof isActive === 'boolean' ? isActive : !supplier.isActive;
  await supplier.save();
  return supplier;
};

/**
 * Get all suppliers with current balance, search, and pagination.
 */
const getSuppliers = async ({ search, status, page = 1, limit = 20 }) => {
  const query = {};

  if (status === 'archived') {
    query.isActive = false;
  } else if (status === 'all') {
    // Both active and archived
  } else {
    query.isActive = true;
  }

  if (search && search.trim()) {
    const reg = new RegExp(search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
    query.$or = [{ name: reg }, { phone: reg }, { gstin: reg }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [suppliers, total] = await Promise.all([
    Supplier.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Supplier.countDocuments(query),
  ]);

  // Attach current balance to each supplier from the latest ledger entry
  const suppliersWithBalance = await Promise.all(
    suppliers.map(async (sup) => {
      const lastEntry = await LedgerEntry.findOne({
        partyType: 'supplier',
        partyId: sup._id,
      })
        .sort({ date: -1, createdAt: -1 })
        .lean();

      const currentBalance = lastEntry
        ? lastEntry.balanceAfter
        : round(sup.openingBalance || 0, 2);

      return {
        ...sup,
        currentBalance,
      };
    })
  );

  return {
    data: suppliersWithBalance,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Get supplier by ID with current balance.
 */
const getSupplierById = async (id) => {
  const supplier = await Supplier.findById(id).lean();
  if (!supplier) {
    throw new Error('Supplier not found');
  }

  const lastEntry = await LedgerEntry.findOne({
    partyType: 'supplier',
    partyId: supplier._id,
  })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const currentBalance = lastEntry
    ? lastEntry.balanceAfter
    : round(supplier.openingBalance || 0, 2);

  return {
    ...supplier,
    currentBalance,
  };
};

/**
 * Record a payment to a supplier in a MongoDB transaction.
 * Overpayment is allowed (balance goes negative = advance), returning a warning.
 */
const recordSupplierPayment = async (supplierId, amount, paymentMode, date, note) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const supplier = await Supplier.findById(supplierId).session(session);
    if (!supplier) {
      throw new Error('Supplier not found');
    }
    if (!supplier.isActive) {
      throw new Error(`Supplier "${supplier.name}" is archived/inactive`);
    }

    const payAmount = round(amount, 2);
    if (payAmount <= 0) {
      throw new Error('Payment amount must be greater than 0');
    }

    const paymentDate = date ? new Date(date) : new Date();

    // Ensure opening entry exists if openingBalance != 0
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
            date: supplier.createdAt || paymentDate,
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

    const newBalance = round(lastBalance - payAmount, 2);

    const [entry] = await LedgerEntry.create(
      [
        {
          partyType: 'supplier',
          partyId: supplier._id,
          date: paymentDate,
          type: 'debit',
          amount: payAmount,
          refType: 'payment',
          refId: null,
          narration: note || `Payment to supplier via ${paymentMode}`,
          balanceAfter: newBalance,
        },
      ],
      { session }
    );

    // Reconcile supplier purchase bills with this payment
    await reconcileSupplierPurchases(supplier._id, session);

    await session.commitTransaction();

    const isOverpayment = newBalance < 0;

    return {
      success: true,
      entry,
      currentBalance: newBalance,
      warning: isOverpayment,
      warningMessage: isOverpayment
        ? `Payment exceeds previous balance. Supplier now has an advance balance of ₹${Math.abs(
            newBalance
          )}.`
        : null,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Reconciles supplier payments against active purchase bills (FIFO).
 */
const reconcileSupplierPurchases = async (supplierId, session = null) => {
  const supplier = await Supplier.findById(supplierId).session(session);
  if (!supplier) return;

  const match = {
    partyType: 'supplier',
    partyId: new mongoose.Types.ObjectId(supplierId),
    type: 'debit',
    refType: { $ne: 'purchase_cancel' },
  };

  const agg = LedgerEntry.aggregate([
    { $match: match },
    { $group: { _id: null, totalDebit: { $sum: '$amount' } } },
  ]);
  if (session) agg.session(session);
  const debitRes = await agg;
  const totalPaid = debitRes[0]?.totalDebit || 0;

  const opening = supplier.openingBalance || 0;
  let availablePayment = round(
    totalPaid - (opening > 0 ? opening : 0) + (opening < 0 ? Math.abs(opening) : 0),
    2
  );

  const purchasesQuery = Purchase.find({ supplier: supplierId, status: 'active' }).sort({
    date: 1,
    createdAt: 1,
    _id: 1,
  });
  if (session) purchasesQuery.session(session);
  const purchases = await purchasesQuery;

  for (const purchase of purchases) {
    const grandTotal = purchase.grandTotal || 0;
    const alloc = Math.max(0, Math.min(grandTotal, availablePayment));
    const due = round(grandTotal - alloc, 2);
    availablePayment = round(availablePayment - alloc, 2);

    if (purchase.paidAmount !== alloc || purchase.dueAmount !== due) {
      purchase.paidAmount = alloc;
      purchase.dueAmount = due;
      if (session) {
        await purchase.save({ session });
      } else {
        await purchase.save();
      }
    }
  }
};

/**
 * Get supplier ledger statement for a date range with running balance.
 */
const getSupplierLedger = async (supplierId, from, to, page, limit) => {
  const supplier = await Supplier.findById(supplierId).lean();
  if (!supplier) {
    throw new Error('Supplier not found');
  }

  // 1. Calculate opening balance for the selected range
  let rangeOpeningBalance = round(supplier.openingBalance || 0, 2);

  if (from) {
    const fromDate = new Date(from);
    // Find the latest entry prior to 'from'
    const priorEntry = await LedgerEntry.findOne({
      partyType: 'supplier',
      partyId: supplier._id,
      date: { $lt: fromDate },
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    if (priorEntry) {
      rangeOpeningBalance = priorEntry.balanceAfter;
    }
  }

  // 2. Fetch entries within the date range
  const dateFilter = {};
  if (from) {
    dateFilter.$gte = new Date(from);
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    dateFilter.$lte = toDate;
  }

  const query = {
    partyType: 'supplier',
    partyId: supplier._id,
  };

  if (from || to) {
    query.date = dateFilter;
  }

  const entries = await LedgerEntry.find(query)
    .sort({ date: 1, createdAt: 1 })
    .lean();

  let totalDebits = 0;
  let totalCredits = 0;

  for (const entry of entries) {
    if (entry.type === 'debit') {
      totalDebits = round(totalDebits + entry.amount, 2);
    } else if (entry.type === 'credit') {
      totalCredits = round(totalCredits + entry.amount, 2);
    }
  }

  const closingBalance =
    entries.length > 0
      ? entries[entries.length - 1].balanceAfter
      : rangeOpeningBalance;

  const total = entries.length;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10) || 30;
  const pagedEntries = pageNum
    ? entries.slice((pageNum - 1) * limitNum, pageNum * limitNum)
    : entries;

  return {
    supplier: {
      _id: supplier._id,
      name: supplier.name,
      phone: supplier.phone,
      gstin: supplier.gstin,
    },
    openingBalance: rangeOpeningBalance,
    entries: pagedEntries,
    pagination: {
      total,
      page: pageNum || 1,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
    closingBalance,
    totalDebits,
    totalCredits,
  };
};

module.exports = {
  createSupplier,
  updateSupplier,
  toggleSupplierStatus,
  getSuppliers,
  getSupplierById,
  recordSupplierPayment,
  reconcileSupplierPurchases,
  getSupplierLedger,
};

