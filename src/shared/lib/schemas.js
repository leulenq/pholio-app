const { z } = require('zod');

const imageUploadSchema = z.object({
  label: z.string().max(80).optional(),
  // Add other metadata fields if needed, e.g. kind
  kind: z.enum(['polaroid', 'headshot', 'full_body']).optional().default('polaroid')
});

module.exports = {
  imageUploadSchema
};
