const { z } = require('zod');

const supplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required').trim(),
  phone: z.string().trim().default(''),
  email: z
    .string()
    .trim()
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: 'Invalid email address',
    })
    .default(''),
  address: z.string().trim().default(''),
  state: z.string().trim().default(''),
  gstin: z.string().trim().default(''),
  openingBalance: z.coerce.number().default(0),
  isActive: z.boolean().default(true),
});

const supplierPaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be greater than 0'),
  paymentMode: z.string().min(1, 'Payment mode is required').trim(),
  date: z.coerce.date().default(() => new Date()),
  note: z.string().trim().default(''),
});

module.exports = {
  supplierSchema,
  supplierPaymentSchema,
};

