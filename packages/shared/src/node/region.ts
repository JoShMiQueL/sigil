import { z } from "zod";

export const RegionSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-zA-Z0-9_.\- ]+$/),
  description: z.string().max(256).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Region = z.infer<typeof RegionSchema>;

export const RegionCreateSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-zA-Z0-9_.\- ]+$/),
  description: z.string().max(256).optional(),
});
export type RegionCreate = z.infer<typeof RegionCreateSchema>;

export const RegionUpdateSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-zA-Z0-9_.\- ]+$/)
    .optional(),
  description: z.string().max(256).optional(),
});
export type RegionUpdate = z.infer<typeof RegionUpdateSchema>;

export const RegionWithCountsSchema = RegionSchema.extend({
  nodeCount: z.number(),
  serverCount: z.number(),
});
export type RegionWithCounts = z.infer<typeof RegionWithCountsSchema>;
