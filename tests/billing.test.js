import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Customer from '../models/Customer';
import Sale from '../models/Sale';
import Settings from '../models/Settings';
import StockMovement from '../models/StockMovement';
import LedgerEntry from '../models/LedgerEntry';
import Counter from '../models/Counter';
import { createSale, getSaleById } from '../services/saleService';
import { recordCustomerPayment, getCustomerLedger } from '../services/customerService';
import { calculateGstTotals } from '../utils/gst';

const TEST_DB_URI =
  process.env.MONGODB_TEST_URI ||
  'mongodb://127.0.0.1:27017/construction_billing_test_db?replicaSet=rs0';

describe('Billing & Sales Backend (Replica Set Transactions)', () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_DB_URI);
    await Promise.all([
      Product.createCollection(),
      Customer.createCollection(),
      Sale.createCollection(),
      Settings.createCollection(),
      StockMovement.createCollection(),
      LedgerEntry.createCollection(),
      Counter.createCollection(),
    ]);
    await Promise.all([
      Product.init(),
      Customer.init(),
      Sale.init(),
      Settings.init(),
      StockMovement.init(),
      LedgerEntry.init(),
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
      Settings.deleteMany({}),
      StockMovement.deleteMany({}),
      LedgerEntry.deleteMany({}),
      Counter.deleteMany({}),
    ]);
  });

  it('1. GST split for same vs different state and fallback when customer has no state', async () => {
    // Business in Maharashtra
    await Settings.create({
      businessName: 'Apex Construction Materials',
      gstin: '27AAAAA0000A1Z5',
      state: 'Maharashtra',
    });

    const product = await Product.create({
      name: 'Ambuja Cement',
      baseUnit: 'bag',
      gstRate: 18,
      units: [{ name: 'bag', factor: 1, sellingPrice: 400 }],
      currentStock: 100,
    });

    // Test A: Same state (Maharashtra -> Intra-state: CGST 9% + SGST 9%)
    const custLocal = await Customer.create({
      name: 'Local Builder',
      state: 'Maharashtra',
    });

    const saleLocal = await createSale({
      customerId: custLocal._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'bag',
          quantity: 10,
          rate: 400,
          gstRate: 18,
        },
      ],
      paidAmount: 0,
    });

    expect(saleLocal.subtotal).toBe(4000); // 10 * 400
    expect(saleLocal.cgst).toBe(360);      // 4000 * 9%
    expect(saleLocal.sgst).toBe(360);      // 4000 * 9%
    expect(saleLocal.igst).toBe(0);
    expect(saleLocal.grandTotal).toBe(4720);

    // Test B: Different state (Gujarat -> Inter-state: IGST 18%)
    const custInter = await Customer.create({
      name: 'Gujarat Infra',
      state: 'Gujarat',
    });

    const saleInter = await createSale({
      customerId: custInter._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'bag',
          quantity: 10,
          rate: 400,
          gstRate: 18,
        },
      ],
      paidAmount: 0,
    });

    expect(saleInter.subtotal).toBe(4000);
    expect(saleInter.cgst).toBe(0);
    expect(saleInter.sgst).toBe(0);
    expect(saleInter.igst).toBe(720);      // 4000 * 18%
    expect(saleInter.grandTotal).toBe(4720);

    // Test C: Customer has no state -> treat as same state as business (CGST + SGST)
    const custNoState = await Customer.create({
      name: 'Walk-in Cash Customer',
      state: '',
    });

    const saleNoState = await createSale({
      customerId: custNoState._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'bag',
          quantity: 5,
          rate: 400,
          gstRate: 18,
        },
      ],
      paidAmount: 0,
    });

    expect(saleNoState.subtotal).toBe(2000);
    expect(saleNoState.cgst).toBe(180);
    expect(saleNoState.sgst).toBe(180);
    expect(saleNoState.igst).toBe(0);
    expect(saleNoState.grandTotal).toBe(2360);
  });

  it('2. Stock block: Rejects sale if quantity exceeds stock (including multi-row aggregation)', async () => {
    const product = await Product.create({
      name: 'Steel Rod 12mm',
      baseUnit: 'kg',
      gstRate: 18,
      units: [
        { name: 'kg', factor: 1, sellingPrice: 65 },
        { name: 'ton', factor: 1000, sellingPrice: 65000 },
      ],
      currentStock: 100, // Only 100 kg in stock
    });

    const customer = await Customer.create({
      name: 'Skyline Developers',
      state: 'Maharashtra',
    });

    // Case A: Single row exceeds stock (150 kg > 100 kg)
    await expect(
      createSale({
        customerId: customer._id.toString(),
        items: [
          {
            productId: product._id.toString(),
            unit: 'kg',
            quantity: 150,
            rate: 65,
          },
        ],
        paidAmount: 0,
      })
    ).rejects.toThrow(/Insufficient stock for "Steel Rod 12mm".*Required: 150 kg, Available: 100 kg/);

    // Case B: Multi-row aggregation exceeds stock (60 kg + 50 kg = 110 kg > 100 kg)
    await expect(
      createSale({
        customerId: customer._id.toString(),
        items: [
          {
            productId: product._id.toString(),
            unit: 'kg',
            quantity: 60,
            rate: 65,
          },
          {
            productId: product._id.toString(),
            unit: 'kg',
            quantity: 50,
            rate: 65,
          },
        ],
        paidAmount: 0,
      })
    ).rejects.toThrow(/Insufficient stock for "Steel Rod 12mm".*Required: 110 kg, Available: 100 kg/);

    // Verify stock was never touched
    const productAfter = await Product.findById(product._id);
    expect(productAfter.currentStock).toBe(100);
  });

  it('3. Rollback on failure: No stock, sale, or ledger change if transaction fails', async () => {
    const productA = await Product.create({
      name: 'River Sand',
      baseUnit: 'brass',
      gstRate: 5,
      units: [{ name: 'brass', factor: 1, sellingPrice: 3500 }],
      currentStock: 50,
    });

    const productB = await Product.create({
      name: 'Red Bricks',
      baseUnit: 'piece',
      gstRate: 12,
      units: [{ name: 'piece', factor: 1, sellingPrice: 10 }],
      currentStock: 500,
    });

    const customer = await Customer.create({
      name: 'Test Rollback Customer',
      state: 'Maharashtra',
    });

    // Attempt sale with valid productA (2 brass) + invalid productB (1000 pieces > 500 available)
    await expect(
      createSale({
        customerId: customer._id.toString(),
        items: [
          {
            productId: productA._id.toString(),
            unit: 'brass',
            quantity: 2,
            rate: 3500,
          },
          {
            productId: productB._id.toString(),
            unit: 'piece',
            quantity: 1000,
            rate: 10,
          },
        ],
        paidAmount: 0,
      })
    ).rejects.toThrow(/Insufficient stock for "Red Bricks"/);

    // Verify atomic rollback
    const [pA, pB, salesCount, movementCount, ledgerCount] = await Promise.all([
      Product.findById(productA._id),
      Product.findById(productB._id),
      Sale.countDocuments({}),
      StockMovement.countDocuments({}),
      LedgerEntry.countDocuments({}),
    ]);

    expect(pA.currentStock).toBe(50);
    expect(pB.currentStock).toBe(500);
    expect(salesCount).toBe(0);
    expect(movementCount).toBe(0);
    expect(ledgerCount).toBe(0);
  });

  it('4. Ledger running balance calculation after a sale and a subsequent payment', async () => {
    const product = await Product.create({
      name: 'UltraTech Cement',
      baseUnit: 'bag',
      gstRate: 18,
      units: [{ name: 'bag', factor: 1, sellingPrice: 350 }],
      currentStock: 100,
    });

    const customer = await Customer.create({
      name: 'Metro Constro Corp',
      state: 'Maharashtra',
      openingBalance: 0,
    });

    // 1. Sale: 10 bags @ 350 = 3500 + 18% GST (630) = 4130 Grand Total.
    // Customer pays 1130 on the spot -> balance due: 3000.
    const sale = await createSale({
      customerId: customer._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'bag',
          quantity: 10,
          rate: 350,
        },
      ],
      paidAmount: 1130,
      paymentMode: 'Cash',
    });

    expect(sale.grandTotal).toBe(4130);
    expect(sale.paidAmount).toBe(1130);
    expect(sale.dueAmount).toBe(3000);

    // Check customer ledger statement after sale
    const ledgerAfterSale = await getCustomerLedger(customer._id);
    expect(ledgerAfterSale.customer.currentBalance).toBe(3000); // customer owes 3000
    expect(ledgerAfterSale.entries.length).toBe(2);

    // Entries are sorted newest first
    const [creditEntry, debitEntry] = ledgerAfterSale.entries;
    expect(debitEntry.type).toBe('debit');
    expect(debitEntry.amount).toBe(4130);
    expect(debitEntry.balanceAfter).toBe(4130);

    expect(creditEntry.type).toBe('credit');
    expect(creditEntry.amount).toBe(1130);
    expect(creditEntry.balanceAfter).toBe(3000);

    // 2. Customer later pays remaining 3000 via UPI
    const paymentResult = await recordCustomerPayment(customer._id, {
      amount: 3000,
      paymentMode: 'UPI',
      note: 'UPI Payment clearance',
    });

    expect(paymentResult.currentBalance).toBe(0); // Fully settled

    // Verify ledger has 3 entries now with final balance 0
    const finalLedger = await getCustomerLedger(customer._id);
    expect(finalLedger.customer.currentBalance).toBe(0);
    expect(finalLedger.entries.length).toBe(3);
    expect(finalLedger.entries[0].type).toBe('credit');
    expect(finalLedger.entries[0].amount).toBe(3000);
    expect(finalLedger.entries[0].balanceAfter).toBe(0);
  });
});
