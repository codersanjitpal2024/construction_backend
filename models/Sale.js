const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
    },
    productName: {
      type: String,
      required: [true, 'Product name is required'],
    },
    hsn: {
      type: String,
      default: '',
    },
    unit: {
      type: String,
      required: [true, 'Unit is required'],
    },
    factor: {
      type: Number,
      required: [true, 'Unit factor is required'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0.000001, 'Quantity must be positive'],
    },
    rate: {
      type: Number,
      required: [true, 'Rate is required'],
      min: [0, 'Rate cannot be negative'],
    },
    baseQty: {
      type: Number,
      required: true,
    },
    gstRate: {
      type: Number,
      required: true,
    },
    taxableAmount: {
      type: Number,
      required: true,
    },
    gstAmount: {
      type: Number,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const customerSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    state: { type: String, default: '' },
    gstin: { type: String, default: '' },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    invoiceNo: {
      type: String,
      required: [true, 'Invoice number is required'],
      unique: true,
      trim: true,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required'],
      index: true,
    },
    customerSnapshot: {
      type: customerSnapshotSchema,
      required: true,
    },
    items: {
      type: [saleItemSchema],
      required: [true, 'Invoice must have at least one line item'],
      validate: [
        (items) => Array.isArray(items) && items.length > 0,
        'At least one line item is required',
      ],
    },
    subtotal: {
      type: Number,
      required: true,
    },
    cgst: {
      type: Number,
      default: 0,
    },
    sgst: {
      type: Number,
      default: 0,
    },
    igst: {
      type: Number,
      default: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, 'Paid amount cannot be negative'],
    },
    dueAmount: {
      type: Number,
      required: true,
    },
    paymentMode: {
      type: String,
      default: 'Cash',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

saleSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Sale || mongoose.model('Sale', saleSchema);

