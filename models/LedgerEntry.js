const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema(
  {
    partyType: {
      type: String,
      required: [true, 'Party type is required'],
      enum: ['supplier', 'customer'],
      index: true,
    },
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Party ID is required'],
      index: true,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Entry type is required (debit or credit)'],
      enum: ['debit', 'credit'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount must be positive'],
    },
    refType: {
      type: String,
      required: [true, 'Reference type is required'],
      enum: [
        'purchase',
        'payment',
        'opening',
        'purchase_cancel',
        'sale',
        'receipt',
        'sale_cancel',
      ],
      index: true,
    },
    refId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    narration: {
      type: String,
      trim: true,
      default: '',
    },
    balanceAfter: {
      type: Number,
      required: [true, 'Balance after is required'],
    },
  },
  {
    timestamps: true,
  }
);

ledgerEntrySchema.index({ partyType: 1, partyId: 1, date: -1, createdAt: -1 });

module.exports = mongoose.models.LedgerEntry || mongoose.model('LedgerEntry', ledgerEntrySchema);
