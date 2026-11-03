const { z } = require('zod');

const saleItemInputSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  unit: z.string().min(1, 'Unit is required').trim(),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  rate: z.coerce.number().min(0, 'Rate cannot be negative'),
  gstRate: z.coerce.number().optional(),
});

const saleInputSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  date: z.string().or(z.date()).optional(),
  items: z.array(saleItemInputSchema).min(1, 'Invoice must have at least one line item'),
  paidAmount: z.coerce.number().min(0, 'Paid amount cannot be negative').default(0),
  paymentMode: z.string().trim().default('Cash'),
  notes: z.string().trim().default(''),
  quotationId: z.string().optional().nullable(),
});

module.exports = {
  saleInputSchema,
};

