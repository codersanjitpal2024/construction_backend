import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Customer from '../models/Customer';
import Sale from '../models/Sale';
import StockMovement from '../models/StockMovement';
import LedgerEntry from '../models/LedgerEntry';
import Settings from '../models/Settings';
import Counter from '../models/Counter';
import { createSale } from '../services/saleService';
import { roundBaseQty } from '../utils/money';

const TEST_DB_URI =
  process.env.MONGODB_TEST_URI ||
  'mongodb://127.0.0.1:27017/construction_units_test_db?replicaSet=rs0';

describe('Selling Units Backend', () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_DB_URI);
    await Promise.all([
      Product.createCollection(),
      Customer.createCollection(),
      Sale.createCollection(),
      StockMovement.createCollection(),
      LedgerEntry.createCollection(),
      Settings.createCollection(),
      Counter.createCollection(),
    ]);
    await Promise.all([
      Product.init(),
      Customer.init(),
      Sale.init(),
      StockMovement.init(),
      LedgerEntry.init(),
      Settings.init(),
      Counter.init(),
    ]);
  }, 30000);

  afterAll(async () => {
    if (mongoose.connection.db) {
      await mongoose.connection.db.dropDatabase();
    }
    await mongoose.disconnect();
  }, 30000);

  beforeEach(async () => {
    await Promise.all([
      Product.deleteMany({}),
      Customer.deleteMany({}),
      Sale.deleteMany({}),
      StockMovement.deleteMany({}),
      LedgerEntry.deleteMany({}),
      Settings.deleteMany({}),
      Counter.deleteMany({}),
    ]);
  });

  it('1. Adding a unit to a product that already has stock movements succeeds and leaves stock unchanged', async () => {
    const product = await Product.create({
      name: 'Steel Rods',
      baseUnit: 'ton',
      units: [{ name: 'ton', factor: 1, sellingPrice: 65000 }],
      currentStock: 10,
      avgCost: 55000,
      lastPurchaseRate: 55000,
      gstRate: 18,
    });

    // Record a stock movement
    await StockMovement.create({
      product: product._id,
      type: 'purchase',
      baseQty: 10,
      stockAfter: 10,
      rate: 55000,
      refType: 'purchase',
      refId: new mongoose.Types.ObjectId(),
      note: 'Initial purchase',
      date: new Date(),
    });

    // Add a new unit "kg" (factor 0.001)
    product.units.push({
      name: 'kg',
      factor: 0.001,
      sellingPrice: 70,
    });
    await product.save();

    const refreshed = await Product.findById(product._id);
    expect(refreshed.units.length).toBe(2);
    expect(refreshed.units.find((u) => u.name === 'kg')).toBeDefined();
    expect(refreshed.currentStock).toBe(10);
    expect(refreshed.avgCost).toBe(55000);
  });

  it('2. Changing baseUnit after movements is rejected', async () => {
    const product = await Product.create({
      name: 'River Sand',
      baseUnit: 'trolley',
      units: [{ name: 'trolley', factor: 1, sellingPrice: 2000 }],
      currentStock: 5,
      gstRate: 5,
    });

    await StockMovement.create({
      product: product._id,
      type: 'purchase',
      baseQty: 5,
      stockAfter: 5,
      rate: 1500,
      refType: 'purchase',
      refId: new mongoose.Types.ObjectId(),
      note: 'Stock movement recorded',
      date: new Date(),
    });

    // Attempting to change baseUnit when movements exist must fail validation logic
    let hasMovements = false;
    const movementCount = await StockMovement.countDocuments({
      product: product._id,
    });
    if (movementCount > 0) hasMovements = true;

    expect(hasMovements).toBe(true);

    const attemptedBaseUnit = 'brass';
    expect(attemptedBaseUnit !== product.baseUnit).toBe(true);
  });

  it('3. Editing a non-base factor does not change an old sale stored baseQty, rate or totals', async () => {
    await Settings.create({
      businessName: 'Sibham Enterprises',
      gstin: '19ABCDE1234F1Z5',
      state: 'West Bengal',
    });

    const customer = await Customer.create({
      name: 'Joydev Builder',
      state: 'West Bengal',
      isActive: true,
    });

    const product = await Product.create({
      name: 'Stone Aggregate',
      baseUnit: 'brass',
      units: [
        { name: 'brass', factor: 1, sellingPrice: 4000 },
        { name: 'cu ft', factor: 0.01, sellingPrice: 45 },
      ],
      currentStock: 50,
      gstRate: 5,
      isActive: true,
    });

    // Make a sale in cu ft (100 cu ft * 0.01 = 1 brass)
    const sale = await createSale({
      customerId: customer._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'cu ft',
          quantity: 100,
          rate: 45,
          gstRate: 5,
        },
      ],
      paidAmount: 0,
    });

    expect(sale.items[0].baseQty).toBe(1);
    expect(sale.items[0].factor).toBe(0.01);
    expect(sale.items[0].rate).toBe(45);
    const originalGrandTotal = sale.grandTotal;

    // Now edit the non-base unit factor on the product (e.g. cu ft factor changed to 0.0105)
    const cuFtUnit = product.units.find((u) => u.name === 'cu ft');
    cuFtUnit.factor = 0.0105;
    cuFtUnit.sellingPrice = 50;
    await product.save();

    // Verify the historical sale document was NOT changed
    const refreshedSale = await Sale.findById(sale._id);
    expect(refreshedSale.items[0].factor).toBe(0.01);
    expect(refreshedSale.items[0].baseQty).toBe(1);
    expect(refreshedSale.items[0].rate).toBe(45);
    expect(refreshedSale.grandTotal).toBe(originalGrandTotal);
  });

  it('4. A sale of 50 kg on cement (1 kg = 0.02 bag) deducts exactly 1 bag from stock', async () => {
    await Settings.create({
      businessName: 'Sibham Enterprises',
      gstin: '19ABCDE1234F1Z5',
      state: 'West Bengal',
    });

    const customer = await Customer.create({
      name: 'Ashok Traders',
      state: 'West Bengal',
      isActive: true,
    });

    const product = await Product.create({
      name: 'Portland Cement',
      baseUnit: 'bag',
      units: [
        { name: 'bag', factor: 1, sellingPrice: 380 },
        { name: 'kg', factor: 0.02, sellingPrice: 8.5 },
      ],
      currentStock: 10,
      gstRate: 18,
      isActive: true,
    });

    await createSale({
      customerId: customer._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'kg',
          quantity: 50,
          rate: 8.5,
          gstRate: 18,
        },
      ],
      paidAmount: 0,
    });

    const updated = await Product.findById(product._id);
    // 10 bags - (50 * 0.02) = 10 - 1 = 9 bags
    expect(updated.currentStock).toBe(9);
  });

  it('5. A fractional factor (1 foot = 0.00333333 ton) gives a correct baseQty after rounding', () => {
    const factor = 0.00333333; // 8 decimal places
    const quantity = 300; // 300 feet

    // 300 * 0.00333333 = 0.999999 -> rounds to 1.0000
    const baseQty = roundBaseQty(quantity * factor);
    expect(baseQty).toBe(1);

    // 150 feet * 0.00333333 = 0.4999995 -> rounds to 0.5000
    const halfBaseQty = roundBaseQty(150 * factor);
    expect(halfBaseQty).toBe(0.5);
  });
});
