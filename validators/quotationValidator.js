const { z } = require('zod');

const quotationItemInputSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  unit: z.string().min(1, 'Unit is required').trim(),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  rate: z.coerce.number().min(0, 'Rate cannot be negative'),
  gstRate: z.coerce.number().optional(),
});

const quotationInputSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  date: z.string().or(z.date()).optional(),
  validUntil: z.string().or(z.date()).optional().nullable(),
  items: z
    .array(quotationItemInputSchema)
    .min(1, 'Quotation must have at least one line item'),
  notes: z.string().trim().optional().default(''),
});

const quotationStatusSchema = z.object({
  status: z.enum(['open', 'rejected'], {
    errorMap: () => ({
      message: 'Status can only be toggled between "open" and "rejected"',
    }),
  }),
});

module.exports = {
  quotationInputSchema,
  quotationStatusSchema,
};

