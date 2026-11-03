const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema(
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
    gstRate: {
      type: Number,
      required: true,
    },
    unit: {
      type: String,
      required: [true, 'Entered unit name is required'],
    },
    factor: {
      type: Number,
      required: [true, 'Unit factor is required'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0.000001, 'Quantity must be greater than 0'],
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
    amount: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNo: {
      type: String,
      required: [true, 'Purchase number is required'],
      unique: true,
      trim: true,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'Supplier reference is required'],
      index: true,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    supplierInvoiceNo: {
      type: String,
      trim: true,
      default: '',
    },
    items: {
      type: [purchaseItemSchema],
      required: [true, 'Purchase must have at least one line item'],
      validate: [
        (items) => Array.isArray(items) && items.length > 0,
        'At least one purchase item is required',
      ],
    },
    subtotal: {
      type: Number,
      required: true,
    },
    gstTotal: {
      type: Number,
      required: true,
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
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'cancelled'],
      default: 'active',
      index: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

purchaseSchema.index({ supplier: 1, date: -1 });

module.exports = mongoose.models.Purchase || mongoose.model('Purchase', purchaseSchema);
