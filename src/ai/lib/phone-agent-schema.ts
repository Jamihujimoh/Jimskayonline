import { z } from 'genkit';

export const PhoneActionArgsSchema = z.object({
  actionName: z.string().optional(),
  app: z.string().optional(),
  confirm: z.boolean().optional(),
  content: z.string().optional(),
  destination: z.string().optional(),
  direction: z.string().optional(),
  distance: z.number().optional(),
  durationMs: z.number().optional(),
  endX: z.number().optional(),
  endY: z.number().optional(),
  expected: z.array(z.string()).optional(),
  fieldLabel: z.string().optional(),
  intentAction: z.string().optional(),
  intentData: z.string().optional(),
  key: z.string().optional(),
  mimeType: z.string().optional(),
  packageName: z.string().optional(),
  path: z.string().optional(),
  query: z.string().optional(),
  source: z.string().optional(),
  startX: z.number().optional(),
  startY: z.number().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
}).passthrough();

export const PhoneAgentInputSchema = PhoneActionArgsSchema.extend({
  steps: z.array(z.object({
    action: z.string(),
    args: PhoneActionArgsSchema.optional(),
    observeAfter: z.boolean().optional(),
  }).passthrough()).optional(),
});