const { z } = require('zod');

const purchaseItemInputSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  unit: z.string().min(1, 'Unit name is required').trim(),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  rate: z.coerce.number().min(0, 'Rate cannot be negative'),
  gstRate: z.coerce.number().optional(),
});

const createPurchaseSchema = z
  .object({
    supplierId: z.string().min(1, 'Supplier ID is required'),
    date: z.coerce.date().default(() => new Date()),
    supplierInvoiceNo: z.string().trim().default(''),
    items: z.array(purchaseItemInputSchema).min(1, 'At least one item is required in a purchase'),
    paidAmount: z.coerce.number().min(0, 'Paid amount cannot be negative').default(0),
    paymentMode: z.string().trim().default(''),
    notes: z.string().trim().default(''),
  })
  .refine(
    (data) => {
      if (data.paidAmount > 0 && !data.paymentMode) {
        return false;
      }
      return true;
    },
    {
      message: 'Payment mode is required when paid amount is greater than 0',
      path: ['paymentMode'],
    }
  );

const cancelPurchaseSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required').trim(),
});

module.exports = {
  createPurchaseSchema,
  cancelPurchaseSchema,
};

