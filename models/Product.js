const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Unit name is required'],
      trim: true,
      lowercase: true,
      maxlength: [20, 'Unit name cannot exceed 20 characters'],
    },
    factor: {
      type: Number,
      required: [true, 'Conversion factor is required'],
      min: [0.00000001, 'Factor must be greater than 0'],
    },
    sellingPrice: {
      type: Number,
      default: 0,
      min: [0, 'Selling price must be non-negative'],
    },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
    },
    hsn: {
      type: String,
      trim: true,
      default: '',
    },
    gstRate: {
      type: Number,
      required: [true, 'GST rate is required'],
      enum: {
        values: [0, 5, 12, 18, 28],
        message: '{VALUE} is not a valid GST rate (must be 0, 5, 12, 18, or 28)',
      },
    },
    baseUnit: {
      type: String,
      required: [true, 'Base unit is required'],
      trim: true,
      lowercase: true,
    },
    units: {
      type: [unitSchema],
      required: [true, 'At least one unit (base unit) is required'],
      validate: [
        {
          validator: function (units) {
            if (!Array.isArray(units) || units.length === 0) return false;
            const names = units.map((u) => u.name?.trim().toLowerCase());
            return new Set(names).size === names.length;
          },
          message: 'Unit names must be unique within a product',
        },
        {
          validator: function (units) {
            if (!Array.isArray(units) || !this.baseUnit) return false;
            const normalizedBaseUnit = this.baseUnit.trim().toLowerCase();
            const baseUnitEntry = units.find(
              (u) => u.name?.trim().toLowerCase() === normalizedBaseUnit
            );
            return !!baseUnitEntry && Number(baseUnitEntry.factor) === 1;
          },
          message:
            'Units must include an entry matching the base unit with a factor of exactly 1',
        },
      ],
    },
    currentStock: {
      type: Number,
      default: 0,
    },
    avgCost: {
      type: Number,
      default: 0,
    },
    lastPurchaseRate: {
      type: Number,
      default: 0,
    },
    minStock: {
      type: Number,
      default: 0,
      min: [0, 'Minimum stock cannot be negative'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique case-insensitive index on product name
productSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);

