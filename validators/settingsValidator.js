const { z } = require('zod');

const settingsInputSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').trim(),
  gstin: z.string().trim().default(''),
  state: z.string().trim().default(''),
  address: z.string().trim().default(''),
  phone: z.string().trim().default(''),
});

module.exports = {
  settingsInputSchema,
};

