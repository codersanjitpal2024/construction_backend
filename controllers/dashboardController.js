const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const LedgerEntry = require('../models/LedgerEntry');
const { round } = require('../utils/money');

// @desc    Get dashboard metrics & statistics
// @route   GET /api/dashboard
// @access  Protected
const getDashboardStats = async (req, res, next) => {
  try {
    const [
      salesCount,
      salesAggResult,
      purchasesCount,
      purchasesAggResult,
      products,
      customers,
      suppliers,
      customerLedgerAgg,
      supplierLedgerAgg,
      recentSales,
    ] = await Promise.all([
      Sale.countDocuments(),
      Sale.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$grandTotal' },
            totalInvoicePaid: { $sum: '$paidAmount' },
            totalInvoiceDue: { $sum: '$dueAmount' },
          },
        },
      ]),
      Purchase.countDocuments({ status: { $ne: 'cancelled' } }),
      Purchase.aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: null,
            totalPurchaseSpend: { $sum: '$grandTotal' },
            totalPurchasePaid: { $sum: '$paidAmount' },
            totalPurchaseDue: { $sum: '$dueAmount' },
          },
        },
      ]),
      Product.find({ isActive: true }).select('currentStock minStock avgCost lastPurchaseRate').lean(),
      Customer.find({ isActive: true }).select('_id openingBalance').lean(),
      Supplier.find({ isActive: true }).select('_id openingBalance').lean(),
      LedgerEntry.aggregate([
        { $match: { partyType: 'customer' } },
        {
          $group: {
            _id: '$partyId',
            totalDebit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
            totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
          },
        },
      ]),
      LedgerEntry.aggregate([
        { $match: { partyType: 'supplier', refType: { $ne: 'purchase_cancel' } } },
        {
          $group: {
            _id: '$partyId',
            totalDebit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
            totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
          },
        },
      ]),
      Sale.find().sort({ createdAt: -1, date: -1 }).limit(8).lean(),
    ]);

    const salesAgg = salesAggResult[0] || { totalRevenue: 0, totalInvoicePaid: 0, totalInvoiceDue: 0 };
    const purchasesAgg = purchasesAggResult[0] || {
      totalPurchaseSpend: 0,
      totalPurchasePaid: 0,
      totalPurchaseDue: 0,
    };

    // Calculate true customer receivables and advance credits
    const customerLedgerMap = new Map();
    let totalCustomerPaymentsReceived = 0;
    for (const row of customerLedgerAgg) {
      customerLedgerMap.set(row._id.toString(), row);
      totalCustomerPaymentsReceived += row.totalCredit || 0;
    }

    let totalCustomerDue = 0;
    let totalCustomerAdvance = 0;

    for (const c of customers) {
      const row = customerLedgerMap.get(c._id.toString()) || { totalDebit: 0, totalCredit: 0 };
      const opening = c.openingBalance || 0;
      const netBalance = round(opening + row.totalDebit - row.totalCredit, 2);
      if (netBalance > 0) {
        totalCustomerDue += netBalance;
      } else if (netBalance < 0) {
        totalCustomerAdvance += Math.abs(netBalance);
      }
    }

    // Calculate true supplier payables and advances
    const supplierLedgerMap = new Map();
    let totalSupplierPaymentsMade = 0;
    for (const row of supplierLedgerAgg) {
      supplierLedgerMap.set(row._id.toString(), row);
      totalSupplierPaymentsMade += row.totalDebit || 0;
    }

    let totalSupplierDue = 0;
    let totalSupplierAdvance = 0;

    for (const s of suppliers) {
      const row = supplierLedgerMap.get(s._id.toString()) || { totalDebit: 0, totalCredit: 0 };
      const opening = s.openingBalance || 0;
      const netBalance = round(opening + row.totalCredit - row.totalDebit, 2);
      if (netBalance > 0) {
        totalSupplierDue += netBalance;
      } else if (netBalance < 0) {
        totalSupplierAdvance += Math.abs(netBalance);
      }
    }

    let inventoryValuation = 0;
    let lowStockCount = 0;

    for (const p of products) {
      const stock = p.currentStock || 0;
      const rate = p.lastPurchaseRate || p.avgCost || 0;
      inventoryValuation += stock * rate;
      if (stock <= (p.minStock || 0)) {
        lowStockCount++;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        totalOrders: salesCount,
        totalRevenue: round(salesAgg.totalRevenue || 0, 2),
        totalCollected: round(totalCustomerPaymentsReceived, 2),
        totalDue: round(totalCustomerDue, 2),
        totalCustomerAdvance: round(totalCustomerAdvance, 2),
        totalPurchases: purchasesCount,
        totalPurchaseSpend: round(purchasesAgg.totalPurchaseSpend || 0, 2),
        totalPurchasePaid: round(totalSupplierPaymentsMade, 2),
        totalPurchaseDue: round(totalSupplierDue, 2),
        totalSupplierAdvance: round(totalSupplierAdvance, 2),
        totalProducts: products.length,
        lowStockCount,
        inventoryValuation: round(inventoryValuation, 2),
        totalCustomers: customers.length,
        totalSuppliers: suppliers.length,
        recentSales,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
};
