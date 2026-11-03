const { z } = require('zod');

const customerInputSchema = z.object({
  name: z.string().min(1, 'Customer name is required').trim(),
  phone: z.string().trim().default(''),
  address: z.string().trim().default(''),
  state: z.string().trim().default(''),
  gstin: z.string().trim().default(''),
  openingBalance: z.coerce.number().default(0),
  isActive: z.boolean().default(true),
});

const customerPaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be greater than 0'),
  paymentMode: z.string().trim().default('Cash'),
  date: z.string().or(z.date()).optional(),
  note: z.string().trim().default(''),
});

module.exports = {
  customerInputSchema,
  customerPaymentSchema,
};

