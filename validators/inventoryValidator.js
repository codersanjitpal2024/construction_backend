const { z } = require('zod');

const adjustStockSchema = z
  .object({
    newQty: z.coerce.number().optional(),
    delta: z.coerce.number().optional(),
    reason: z.string().min(1, 'Reason for stock adjustment is required').trim(),
  })
  .refine(
    (data) => data.newQty !== undefined || data.delta !== undefined,
    {
      message: 'Either newQty or delta must be provided for stock adjustment',
      path: ['newQty'],
    }
  );

module.exports = {
  adjustStockSchema,
};

