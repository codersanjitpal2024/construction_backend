const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    state: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    invoicePrefix: {
      type: String,
      trim: true,
      default: 'INV-',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

