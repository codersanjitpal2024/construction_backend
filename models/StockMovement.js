const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Movement type is required'],
      enum: ['purchase', 'sale', 'adjustment', 'purchase_cancel', 'sale_cancel'],
      index: true,
    },
    baseQty: {
      type: Number,
      required: [true, 'Base quantity is required'],
    },
    stockAfter: {
      type: Number,
      required: [true, 'Stock after movement is required'],
    },
    rate: {
      type: Number,
      default: 0,
    },
    refType: {
      type: String,
      required: [true, 'Reference type is required'],
    },
    refId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    note: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

stockMovementSchema.index({ product: 1, date: -1 });

module.exports = mongoose.models.StockMovement || mongoose.model('StockMovement', stockMovementSchema);
