import { z } from "zod";

export const GroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Group = z.infer<typeof GroupSchema>;

export const GroupCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
});
export type GroupCreate = z.infer<typeof GroupCreateSchema>;

export const GroupUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
});
export type GroupUpdate = z.infer<typeof GroupUpdateSchema>;
