const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Counter name/identifier is required'],
      unique: true,
      trim: true,
    },
    seq: {
      type: Number,
      default: 0,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

