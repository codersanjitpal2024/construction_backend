const { z } = require('zod');

const productUnitSchema = z.object({
  name: z
    .string()
    .min(1, 'Unit name is required')
    .max(20, 'Unit name cannot exceed 20 characters')
    .trim()
    .toLowerCase(),
  factor: z.coerce.number().positive('Unit conversion factor must be greater than 0'),
  sellingPrice: z.coerce.number().min(0, 'Selling price must be 0 or greater').default(0),
});

const productInputSchema = z
  .object({
    name: z.string().min(1, 'Product name is required').trim(),
    category: z.string().trim().default('General'),
    hsn: z.string().trim().default(''),
    gstRate: z.coerce.number().refine((val) => [0, 5, 12, 18, 28].includes(val), {
      message: 'GST rate must be one of 0, 5, 12, 18, or 28%',
    }),
    baseUnit: z.string().min(1, 'Base unit is required').trim().toLowerCase(),
    units: z.array(productUnitSchema).min(1, 'At least one unit is required'),
    minStock: z.coerce.number().min(0, 'Minimum stock cannot be negative').default(0),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    const normalizedBaseUnit = data.baseUnit.trim().toLowerCase();

    // 1. Check for duplicate unit names
    const unitNames = data.units.map((u) => u.name.trim().toLowerCase());
    const uniqueNames = new Set(unitNames);
    if (uniqueNames.size !== unitNames.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unit names must be unique within a product',
        path: ['units'],
      });
    }

    // 2. Units must include one whose name equals baseUnit with factor exactly 1
    const baseUnitEntry = data.units.find(
      (u) => u.name.trim().toLowerCase() === normalizedBaseUnit
    );

    if (!baseUnitEntry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Units list must include an entry matching base unit "${data.baseUnit}"`,
        path: ['units'],
      });
    } else if (Number(baseUnitEntry.factor) !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Base unit "${data.baseUnit}" conversion factor must be exactly 1`,
        path: ['units'],
      });
    }
  });

const updateUnitsSchema = z
  .union([
    z.object({
      units: z.array(productUnitSchema).min(1, 'At least one unit is required'),
    }),
    z.array(productUnitSchema).min(1, 'At least one unit is required'),
  ])
  .transform((val) => (Array.isArray(val) ? { units: val } : val))
  .superRefine((data, ctx) => {
    // Check for duplicate unit names
    const unitNames = data.units.map((u) => u.name.trim().toLowerCase());
    const uniqueNames = new Set(unitNames);
    if (uniqueNames.size !== unitNames.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unit names must be unique within a product',
        path: ['units'],
      });
    }
  });

module.exports = {
  productInputSchema,
  productUnitSchema,
  updateUnitsSchema,
};

