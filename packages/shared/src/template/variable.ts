import { z } from "zod";

export const VariableDataTypeSchema = z.enum(["string", "integer", "boolean", "select"]);
export type VariableDataType = z.infer<typeof VariableDataTypeSchema>;

export const VariableVisibilitySchema = z.enum(["hidden", "viewable", "editable"]);
export type VariableVisibility = z.infer<typeof VariableVisibilitySchema>;

export const VariableSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  name: z.string().min(1).max(100),
  envVar: z.string().min(1).max(100),
  dataType: VariableDataTypeSchema,
  defaultValue: z.string(),
  required: z.boolean().default(false),
  minValue: z.number().int().nullable(),
  maxValue: z.number().int().nullable(),
  minLength: z.number().int().nullable(),
  maxLength: z.number().int().nullable(),
  regexPattern: z.string().nullable(),
  allowedValues: z.array(z.string()).nullable(),
  visibility: VariableVisibilitySchema.default("editable"),
  sortOrder: z.number().int().default(0),
});
export type Variable = z.infer<typeof VariableSchema>;

export const VariableCreateSchema = z.object({
  name: z.string().min(1).max(100),
  envVar: z.string().min(1).max(100),
  dataType: VariableDataTypeSchema,
  defaultValue: z.string(),
  required: z.boolean().default(false),
  minValue: z.number().int().nullable().optional(),
  maxValue: z.number().int().nullable().optional(),
  minLength: z.number().int().nullable().optional(),
  maxLength: z.number().int().nullable().optional(),
  regexPattern: z.string().nullable().optional(),
  allowedValues: z.array(z.string()).nullable().optional(),
  visibility: VariableVisibilitySchema.default("editable"),
  sortOrder: z.number().int().default(0),
});
export type VariableCreate = z.infer<typeof VariableCreateSchema>;
