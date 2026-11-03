import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Supplier from '../models/Supplier';
import Purchase from '../models/Purchase';
import StockMovement from '../models/StockMovement';
import LedgerEntry from '../models/LedgerEntry';
import Counter from '../models/Counter';
import { createPurchase, cancelPurchase } from '../services/purchaseService';
import { recordSupplierPayment, getSupplierLedger } from '../services/supplierService';
import { adjustStock } from '../services/inventoryService';

const TEST_DB_URI =
  process.env.MONGODB_TEST_URI ||
  'mongodb://127.0.0.1:27017/construction_test_db?replicaSet=rs0';

describe('Purchase & Ledger Backend (Replica Set Transactions)', () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_DB_URI);
    // Ensure all collections and indexes are initialized before transactions run
    await Promise.all([
      Product.createCollection(),
      Supplier.createCollection(),
      Purchase.createCollection(),
      StockMovement.createCollection(),
      LedgerEntry.createCollection(),
      Counter.createCollection(),
    ]);
    await Promise.all([
      Product.init(),
      Supplier.init(),
      Purchase.init(),
      StockMovement.init(),
      LedgerEntry.init(),
      Counter.init(),
    ]);
  }, 30000);

  afterAll(async () => {
    // Drop test database to clean up completely
    if (mongoose.connection.db) {
      await mongoose.connection.db.dropDatabase();
    }
    await mongoose.disconnect();
  }, 30000);

  beforeEach(async () => {
    // Clean collections before each test
    await Promise.all([
      Product.deleteMany({}),
      Supplier.deleteMany({}),
      Purchase.deleteMany({}),
      StockMovement.deleteMany({}),
      LedgerEntry.deleteMany({}),
      Counter.deleteMany({}),
    ]);
  });

  it('1. Weighted average cost across 2 purchases at different rates and units', async () => {
    // 1. Create product: Cement with baseUnit: bag, otherUnit: ton (factor: 20)
    const product = await Product.create({
      name: 'UltraTech PPC Cement',
      category: 'Cement',
      gstRate: 0, // 0% GST to test pure base cost weighting
      baseUnit: 'bag',
      units: [
        { name: 'bag', factor: 1, sellingPrice: 0 },
        { name: 'ton', factor: 20, sellingPrice: 0 },
      ],
      currentStock: 0,
      avgCost: 0,
    });

    const supplier = await Supplier.create({
      name: 'Cement Traders Ltd',
      openingBalance: 0,
    });

    // Purchase 1: 10 bags @ ₹350 per bag
    const purchase1 = await createPurchase({
      supplierId: supplier._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'bag',
          quantity: 10,
          rate: 350,
        },
      ],
      paidAmount: 0,
    });

    expect(purchase1.purchaseNo).toMatch(/^PUR-\d{4}-0001$/);

    const productAfterP1 = await Product.findById(product._id);
    expect(productAfterP1.currentStock).toBe(10);
    expect(productAfterP1.avgCost).toBe(350);
    expect(productAfterP1.lastPurchaseRate).toBe(350);

    // Purchase 2: 1 ton (= 20 bags) @ ₹6,000 per ton (=> ₹300 per bag)
    await createPurchase({
      supplierId: supplier._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'ton',
          quantity: 1,
          rate: 6000,
        },
      ],
      paidAmount: 0,
    });

    const productAfterP2 = await Product.findById(product._id);

    // Calculation:
    // Old Stock: 10, Old Avg: 350 (Total: 3500)
    // New Incoming: 20 bags @ 300 (Total: 6000)
    // New Stock = 10 + 20 = 30
    // New Avg = (3500 + 6000) / 30 = 9500 / 30 = 316.67
    expect(productAfterP2.currentStock).toBe(30);
    expect(productAfterP2.avgCost).toBe(316.67);
    expect(productAfterP2.lastPurchaseRate).toBe(300);
  });

  it('2. Unit conversion (1 ton = 20 bag)', async () => {
    const product = await Product.create({
      name: 'Ambuja Cement',
      category: 'Cement',
      gstRate: 18,
      baseUnit: 'bag',
      units: [
        { name: 'bag', factor: 1, sellingPrice: 0 },
        { name: 'ton', factor: 20, sellingPrice: 0 },
      ],
    });

    const supplier = await Supplier.create({
      name: 'Ambuja Distributors',
    });

    const purchase = await createPurchase({
      supplierId: supplier._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'ton',
          quantity: 2, // 2 tons = 40 bags
          rate: 7000, // ₹7000/ton => ₹350/bag
        },
      ],
      paidAmount: 0,
    });

    // Check item snapshot in purchase document
    const item = purchase.items[0];
    expect(item.unit).toBe('ton');
    expect(item.factor).toBe(20);
    expect(item.quantity).toBe(2);
    expect(item.baseQty).toBe(40);
    expect(item.amount).toBe(14000); // 2 * 7000

    // Check product updated in base units
    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.currentStock).toBe(40);

    // Check StockMovement created in base units
    const movement = await StockMovement.findOne({
      refId: purchase._id,
      product: product._id,
    });
    expect(movement).toBeDefined();
    expect(movement.baseQty).toBe(40);
    expect(movement.stockAfter).toBe(40);
    expect(movement.rate).toBe(350); // 7000 / 20 = 350
  });

  it('3. Transaction rollback when one item is invalid (no stock or ledger change)', async () => {
    const product1 = await Product.create({
      name: 'River Sand',
      category: 'Sand',
      gstRate: 5,
      baseUnit: 'brass',
      units: [{ name: 'brass', factor: 1, sellingPrice: 0 }],
      currentStock: 10,
      avgCost: 4000,
    });

    const supplier = await Supplier.create({
      name: 'Maa Tara Sand Traders',
      openingBalance: 1000,
    });

    const nonExistentProductId = new mongoose.Types.ObjectId().toString();

    // Attempt purchase where item 1 is valid, but item 2 has an invalid product
    await expect(
      createPurchase({
        supplierId: supplier._id.toString(),
        items: [
          {
            productId: product1._id.toString(),
            unit: 'brass',
            quantity: 5,
            rate: 4200,
          },
          {
            productId: nonExistentProductId,
            unit: 'brass',
            quantity: 2,
            rate: 4200,
          },
        ],
        paidAmount: 1000,
      })
    ).rejects.toThrow();

    // Verify Product 1 stock and cost are UNCHANGED
    const product1After = await Product.findById(product1._id);
    expect(product1After.currentStock).toBe(10);
    expect(product1After.avgCost).toBe(4000);

    // Verify NO purchase document was created
    const purchaseCount = await Purchase.countDocuments({});
    expect(purchaseCount).toBe(0);

    // Verify NO stock movement was created
    const movementCount = await StockMovement.countDocuments({});
    expect(movementCount).toBe(0);

    // Verify NO ledger entry was created
    const ledgerCount = await LedgerEntry.countDocuments({});
    expect(ledgerCount).toBe(0);
  });

  it('4. Cancel purchase reversal (stock reversed, ledger credited/debited, rejection on insufficient stock)', async () => {
    const product = await Product.create({
      name: 'TMT Steel 16mm',
      category: 'Steel',
      gstRate: 18,
      baseUnit: 'kg',
      units: [
        { name: 'kg', factor: 1, sellingPrice: 0 },
        { name: 'ton', factor: 1000, sellingPrice: 0 },
      ],
      currentStock: 0,
      avgCost: 0,
    });

    const supplier = await Supplier.create({
      name: 'Steel Authority Vendor',
      openingBalance: 0,
    });

    // Purchase 500 kg @ ₹60/kg
    // Amount = 30,000, GST 18% = 5,400, Grand Total = 35,400. Paid: 10,000
    const purchase = await createPurchase({
      supplierId: supplier._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'kg',
          quantity: 500,
          rate: 60,
        },
      ],
      paidAmount: 10000,
      paymentMode: 'Bank Transfer',
    });

    const productAfterPurchase = await Product.findById(product._id);
    expect(productAfterPurchase.currentStock).toBe(500);

    // Test rejection if stock is insufficient:
    // Simulate consuming 100 kg, leaving only 400 kg in stock
    productAfterPurchase.currentStock = 400;
    await productAfterPurchase.save();

    await expect(
      cancelPurchase(purchase._id.toString(), 'Returned defective lot')
    ).rejects.toThrow(/insufficient stock/i);

    // Restore stock to 500 and perform successful cancel
    productAfterPurchase.currentStock = 500;
    await productAfterPurchase.save();

    const cancelledPurchase = await cancelPurchase(
      purchase._id.toString(),
      'Returned defective lot'
    );

    expect(cancelledPurchase.status).toBe('cancelled');
    expect(cancelledPurchase.cancelReason).toBe('Returned defective lot');

    // Product stock should revert to 0 and avgCost reset to 0
    const productAfterCancel = await Product.findById(product._id);
    expect(productAfterCancel.currentStock).toBe(0);
    expect(productAfterCancel.avgCost).toBe(0);

    // Verify StockMovement for cancellation
    const cancelMovement = await StockMovement.findOne({
      type: 'purchase_cancel',
      refId: purchase._id,
    });
    expect(cancelMovement).toBeDefined();
    expect(cancelMovement.baseQty).toBe(-500);
    expect(cancelMovement.stockAfter).toBe(0);

    // Verify Ledger reversal
    const ledger = await getSupplierLedger(supplier._id.toString());
    // Initial:
    // 1. Credit 35,400 (Purchase) -> balance: 35,400
    // 2. Debit 10,000 (Payment) -> balance: 25,400
    // Cancel Reversal:
    // 3. Debit 35,400 (Purchase Cancel) -> balance: -10,000
    // 4. Credit 10,000 (Payment Reversal) -> balance: 0
    expect(ledger.closingBalance).toBe(0);
    expect(ledger.entries.length).toBe(4);
  });

  it('5. Ledger running balance calculation', async () => {
    // Supplier with opening balance ₹5,000 (amount we owe them)
    const supplier = await Supplier.create({
      name: 'Apex Bricks & Blocks',
      openingBalance: 5000,
    });

    const product = await Product.create({
      name: 'Red Clay Bricks',
      category: 'Bricks',
      gstRate: 5,
      baseUnit: 'piece',
      units: [{ name: 'piece', factor: 1, sellingPrice: 0 }],
    });

    // 1. Create Purchase of 1000 pieces @ ₹10 = ₹10,000 + 5% GST (₹500) = ₹10,500
    // Pay ₹2,500 at the time of purchase
    const purchase = await createPurchase({
      supplierId: supplier._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'piece',
          quantity: 1000,
          rate: 10,
        },
      ],
      paidAmount: 2500,
      paymentMode: 'Cash',
    });

    // 2. Record an additional payment of ₹3,000
    await recordSupplierPayment(
      supplier._id.toString(),
      3000,
      'UPI',
      new Date(),
      'Part payment for brick order'
    );

    // Verify statement via getSupplierLedger
    const ledger = await getSupplierLedger(supplier._id.toString());

    // Expected sequence:
    // Entry 1 (Opening): Credit ₹5,000 -> balanceAfter: ₹5,000
    // Entry 2 (Purchase): Credit ₹10,500 -> balanceAfter: ₹15,500
    // Entry 3 (Payment on Purchase): Debit ₹2,500 -> balanceAfter: ₹13,000
    // Entry 4 (Separate Payment): Debit ₹3,000 -> balanceAfter: ₹10,000

    expect(ledger.entries.length).toBe(4);

    expect(ledger.entries[0].refType).toBe('opening');
    expect(ledger.entries[0].type).toBe('credit');
    expect(ledger.entries[0].amount).toBe(5000);
    expect(ledger.entries[0].balanceAfter).toBe(5000);

    expect(ledger.entries[1].refType).toBe('purchase');
    expect(ledger.entries[1].type).toBe('credit');
    expect(ledger.entries[1].amount).toBe(10500);
    expect(ledger.entries[1].balanceAfter).toBe(15500);

    expect(ledger.entries[2].refType).toBe('payment');
    expect(ledger.entries[2].type).toBe('debit');
    expect(ledger.entries[2].amount).toBe(2500);
    expect(ledger.entries[2].balanceAfter).toBe(13000);

    expect(ledger.entries[3].refType).toBe('payment');
    expect(ledger.entries[3].type).toBe('debit');
    expect(ledger.entries[3].amount).toBe(3000);
    expect(ledger.entries[3].balanceAfter).toBe(10000);

    expect(ledger.closingBalance).toBe(10000);
    expect(ledger.totalDebits).toBe(5500); // 2500 + 3000
    expect(ledger.totalCredits).toBe(15500); // 5000 + 10500
  });

  it('6. Stock adjustment updates product stock and records adjustment movement', async () => {
    const product = await Product.create({
      name: 'White Cement 1kg',
      category: 'Cement',
      gstRate: 18,
      baseUnit: 'piece',
      units: [{ name: 'piece', factor: 1, sellingPrice: 0 }],
      currentStock: 50,
      avgCost: 35,
    });

    const result = await adjustStock(product._id.toString(), {
      newQty: 45,
      reason: 'Physical inventory audit adjustment (5 damaged packets)',
    });

    expect(result.product.currentStock).toBe(45);

    const movement = await StockMovement.findOne({
      product: product._id,
      type: 'adjustment',
    });
    expect(movement).toBeDefined();
    expect(movement.baseQty).toBe(-5);
    expect(movement.stockAfter).toBe(45);
    expect(movement.note).toBe('Physical inventory audit adjustment (5 damaged packets)');

    await expect(
      adjustStock(product._id.toString(), {
        delta: -50,
        reason: 'Attempting negative stock',
      })
    ).rejects.toThrow(/negative/i);
  });

  it('7. Overpayment to supplier creates advance and returns warning flag', async () => {
    const supplier = await Supplier.create({
      name: 'Steel Rolling Mills',
      openingBalance: 2000,
    });

    const paymentResult = await recordSupplierPayment(
      supplier._id.toString(),
      3000,
      'Bank Transfer',
      new Date(),
      'Excess advance payment'
    );

    expect(paymentResult.success).toBe(true);
    expect(paymentResult.currentBalance).toBe(-1000);
    expect(paymentResult.warning).toBe(true);
    expect(paymentResult.warningMessage).toMatch(/advance/i);

    const entry = await LedgerEntry.findById(paymentResult.entry._id);
    expect(entry.balanceAfter).toBe(-1000);
    expect(entry.type).toBe('debit');
    expect(entry.amount).toBe(3000);
  });
});
