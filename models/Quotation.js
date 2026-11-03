const mongoose = require('mongoose');

const quotationItemSnapshotSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    hsn: {
      type: String,
      default: '',
      trim: true,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
    factor: {
      type: Number,
      required: true,
      min: 0.0001,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.0001,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    baseQty: {
      type: Number,
      required: true,
      min: 0.0001,
    },
    gstRate: {
      type: Number,
      required: true,
      enum: [0, 5, 12, 18, 28],
    },
    taxableAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    gstAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const customerSnapshotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    state: {
      type: String,
      default: '',
      trim: true,
    },
    gstin: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false }
);

const quotationSchema = new mongoose.Schema(
  {
    quotationNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    validUntil: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    customerSnapshot: {
      type: customerSnapshotSchema,
      required: true,
    },
    items: {
      type: [quotationItemSnapshotSchema],
      required: true,
      validate: {
        validator: function (items) {
          return items && items.length > 0;
        },
        message: 'Quotation must have at least one line item',
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    cgst: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    sgst: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    igst: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['open', 'converted', 'rejected'],
      default: 'open',
      index: true,
    },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

quotationSchema.index({ createdAt: -1 });
quotationSchema.index({ 'customerSnapshot.name': 'text', quotationNo: 'text' });

module.exports = mongoose.models.Quotation || mongoose.model('Quotation', quotationSchema);
