import { z } from "zod";

export const ChangeTypeSchema = z.enum([
  "added",
  "changed",
  "deprecated",
  "removed",
  "fixed",
  "security",
]);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

export const ChangeSchema = z.object({
  type: ChangeTypeSchema,
  description: z.string().min(1),
});
export type Change = z.infer<typeof ChangeSchema>;

export const ChangelogEntrySchema = z.object({
  version: z.string(),
  date: z.string(),
  changes: z.array(ChangeSchema),
});
export type ChangelogEntry = z.infer<typeof ChangelogEntrySchema>;

export const ChangelogSchema = z.array(ChangelogEntrySchema);
export type Changelog = z.infer<typeof ChangelogSchema>;
