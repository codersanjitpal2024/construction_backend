import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Customer from '../models/Customer';
import Sale from '../models/Sale';
import Quotation from '../models/Quotation';
import Settings from '../models/Settings';
import StockMovement from '../models/StockMovement';
import LedgerEntry from '../models/LedgerEntry';
import Counter from '../models/Counter';
import { createQuotation, getQuotationById } from '../services/quotationService';
import { createSale } from '../services/saleService';

const TEST_DB_URI =
  process.env.MONGODB_TEST_URI ||
  'mongodb://127.0.0.1:27017/construction_quotation_test_db?replicaSet=rs0';

describe('Quotations Backend', () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_DB_URI);
    await Promise.all([
      Product.createCollection(),
      Customer.createCollection(),
      Sale.createCollection(),
      Quotation.createCollection(),
      Settings.createCollection(),
      StockMovement.createCollection(),
      LedgerEntry.createCollection(),
      Counter.createCollection(),
    ]);
    await Promise.all([
      Product.init(),
      Customer.init(),
      Sale.init(),
      Quotation.init(),
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
      Quotation.deleteMany({}),
      Settings.deleteMany({}),
      StockMovement.deleteMany({}),
      LedgerEntry.deleteMany({}),
      Counter.deleteMany({}),
    ]);
  });

  it('1. quotation creation does not change stock or ledger, even when quantity exceeds stock', async () => {
    await Settings.create({
      businessName: 'Sibham Enterprises',
      gstin: '19ABCDE1234F1Z5',
      state: 'West Bengal',
    });

    const customer = await Customer.create({
      name: 'Ramesh Construction',
      phone: '9876543210',
      state: 'West Bengal',
      isActive: true,
    });

    const product = await Product.create({
      name: 'Ultratech Cement',
      baseUnit: 'bag',
      units: [{ name: 'bag', factor: 1, sellingPrice: 380 }],
      currentStock: 10,
      gstRate: 18,
      isActive: true,
    });

    // Create quotation for 50 bags (exceeds stock of 10)
    const quotation = await createQuotation({
      customerId: customer._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'bag',
          quantity: 50,
          rate: 380,
          gstRate: 18,
        },
      ],
      notes: 'Estimate for foundation slab',
    });

    expect(quotation).toBeDefined();
    expect(quotation.quotationNo).toMatch(/^QUO-\d{4}$/);
    expect(quotation.status).toBe('open');
    expect(quotation.grandTotal).toBeGreaterThan(0);

    // Verify stock did NOT change
    const refreshedProduct = await Product.findById(product._id);
    expect(refreshedProduct.currentStock).toBe(10);

    // Verify NO StockMovement created
    const stockMovements = await StockMovement.find({ product: product._id });
    expect(stockMovements.length).toBe(0);

    // Verify NO LedgerEntry created
    const ledgerEntries = await LedgerEntry.find({ partyId: customer._id });
    expect(ledgerEntries.length).toBe(0);
  });

  it('2. GST matches the sale calculation for the same input', async () => {
    await Settings.create({
      businessName: 'Sibham Enterprises',
      gstin: '19ABCDE1234F1Z5',
      state: 'West Bengal',
    });

    const customer = await Customer.create({
      name: 'Suresh Kumar',
      state: 'West Bengal',
      isActive: true,
    });

    const product = await Product.create({
      name: 'TMT Steel 12mm',
      baseUnit: 'ton',
      units: [{ name: 'ton', factor: 1, sellingPrice: 50000 }],
      currentStock: 20,
      gstRate: 18,
      isActive: true,
    });

    const itemsInput = [
      {
        productId: product._id.toString(),
        unit: 'ton',
        quantity: 2,
        rate: 50000,
        gstRate: 18,
      },
    ];

    // Create quotation
    const quotation = await createQuotation({
      customerId: customer._id.toString(),
      items: itemsInput,
    });

    // Create sale with exact same items
    const sale = await createSale({
      customerId: customer._id.toString(),
      items: itemsInput,
      paidAmount: 0,
    });

    // Verify financial breakdown matches exactly
    expect(quotation.subtotal).toBe(sale.subtotal);
    expect(quotation.cgst).toBe(sale.cgst);
    expect(quotation.sgst).toBe(sale.sgst);
    expect(quotation.igst).toBe(sale.igst);
    expect(quotation.grandTotal).toBe(sale.grandTotal);
  });

  it('3. converting creates the sale and marks the quotation converted', async () => {
    await Settings.create({
      businessName: 'Sibham Enterprises',
      gstin: '19ABCDE1234F1Z5',
      state: 'West Bengal',
    });

    const customer = await Customer.create({
      name: 'Mondal Builders',
      state: 'West Bengal',
      isActive: true,
    });

    const product = await Product.create({
      name: 'Red Bricks',
      baseUnit: 'piece',
      units: [{ name: 'piece', factor: 1, sellingPrice: 12 }],
      currentStock: 5000,
      gstRate: 5,
      isActive: true,
    });

    const quotation = await createQuotation({
      customerId: customer._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'piece',
          quantity: 2000,
          rate: 12,
          gstRate: 5,
        },
      ],
    });

    expect(quotation.status).toBe('open');

    // Convert quotation to sale
    const sale = await createSale({
      customerId: customer._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'piece',
          quantity: 2000,
          rate: 12,
          gstRate: 5,
        },
      ],
      paidAmount: 5000,
      quotationId: quotation._id.toString(),
    });

    expect(sale).toBeDefined();
    expect(sale.invoiceNo).toMatch(/^INV-\d{4}$/);

    // Verify quotation is converted and linked to the sale
    const updatedQuotation = await Quotation.findById(quotation._id);
    expect(updatedQuotation.status).toBe('converted');
    expect(updatedQuotation.saleId.toString()).toBe(sale._id.toString());
  });

  it('4. a quotation cannot be converted twice', async () => {
    await Settings.create({
      businessName: 'Sibham Enterprises',
      gstin: '19ABCDE1234F1Z5',
      state: 'West Bengal',
    });

    const customer = await Customer.create({
      name: 'Bengal Infra',
      state: 'West Bengal',
      isActive: true,
    });

    const product = await Product.create({
      name: 'Sand',
      baseUnit: 'trolley',
      units: [{ name: 'trolley', factor: 1, sellingPrice: 2500 }],
      currentStock: 100,
      gstRate: 5,
      isActive: true,
    });

    const quotation = await createQuotation({
      customerId: customer._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'trolley',
          quantity: 10,
          rate: 2500,
          gstRate: 5,
        },
      ],
    });

    // First conversion: succeeds
    await createSale({
      customerId: customer._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'trolley',
          quantity: 10,
          rate: 2500,
          gstRate: 5,
        },
      ],
      quotationId: quotation._id.toString(),
    });

    // Second conversion attempt: must throw error
    await expect(
      createSale({
        customerId: customer._id.toString(),
        items: [
          {
            productId: product._id.toString(),
            unit: 'trolley',
            quantity: 10,
            rate: 2500,
            gstRate: 5,
          },
        ],
        quotationId: quotation._id.toString(),
      })
    ).rejects.toThrow(/already converted|cannot be converted/i);
  });

  it('5. a failed conversion (e.g. not enough stock) leaves the quotation open and changes nothing', async () => {
    await Settings.create({
      businessName: 'Sibham Enterprises',
      gstin: '19ABCDE1234F1Z5',
      state: 'West Bengal',
    });

    const customer = await Customer.create({
      name: 'Ali Construction',
      state: 'West Bengal',
      isActive: true,
    });

    const product = await Product.create({
      name: 'White Cement',
      baseUnit: 'bag',
      units: [{ name: 'bag', factor: 1, sellingPrice: 450 }],
      currentStock: 5, // Only 5 in stock!
      gstRate: 18,
      isActive: true,
    });

    // Quotation created for 20 bags
    const quotation = await createQuotation({
      customerId: customer._id.toString(),
      items: [
        {
          productId: product._id.toString(),
          unit: 'bag',
          quantity: 20,
          rate: 450,
          gstRate: 18,
        },
      ],
    });

    expect(quotation.status).toBe('open');

    // Attempting conversion with 20 bags when only 5 in stock
    await expect(
      createSale({
        customerId: customer._id.toString(),
        items: [
          {
            productId: product._id.toString(),
            unit: 'bag',
            quantity: 20,
            rate: 450,
            gstRate: 18,
          },
        ],
        quotationId: quotation._id.toString(),
      })
    ).rejects.toThrow(/Insufficient stock/i);

    // Verify quotation remains OPEN and saleId is still null
    const quotationAfterFail = await Quotation.findById(quotation._id);
    expect(quotationAfterFail.status).toBe('open');
    expect(quotationAfterFail.saleId).toBeNull();

    // Verify product stock was untouched (still 5)
    const productAfterFail = await Product.findById(product._id);
    expect(productAfterFail.currentStock).toBe(5);

    // Verify no sales invoice was created
    const salesCount = await Sale.countDocuments();
    expect(salesCount).toBe(0);

    // Verify no ledger entries were created
    const ledgerCount = await LedgerEntry.countDocuments();
    expect(ledgerCount).toBe(0);
  });
});

