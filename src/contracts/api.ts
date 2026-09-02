import { z } from "zod";

export const idSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
    requestId: z.string().uuid().optional(),
  }),
});

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("theater_campaign"),
  version: z.string().min(1),
  ollamaUrl: z.string().url(),
  godModeEnabled: z.boolean(),
  requestId: z.string().uuid(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
