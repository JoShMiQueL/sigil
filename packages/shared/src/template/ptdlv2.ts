import { z } from "zod";

export const PTDLv2VariableSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  env_variable: z.string(),
  default_value: z.string(),
  user_viewable: z.boolean().default(true),
  user_editable: z.boolean().default(false),
  rules: z.string(),
  field_type: z.string().default("text"),
});
export type PTDLv2Variable = z.infer<typeof PTDLv2VariableSchema>;

export const PTDLv2EggSchema = z.object({
  meta: z.object({
    version: z.literal("PTDL_v2"),
    update_url: z.string().nullable().optional(),
  }),
  name: z.string().min(1).max(191),
  author: z.string(),
  description: z.string().optional(),
  features: z.array(z.string()).nullable().optional(),
  docker_images: z.record(z.string(), z.string()),
  file_denylist: z.array(z.string()).nullable().optional(),
  startup: z.string(),
  config: z.object({
    files: z.string().optional(),
    startup: z.string().optional(),
    logs: z.string().optional(),
    stop: z.string(),
  }),
  scripts: z
    .object({
      installation: z.object({
        script: z.string(),
        container: z.string(),
        entrypoint: z.string(),
      }),
    })
    .optional(),
  variables: z.array(PTDLv2VariableSchema).default([]),
});
export type PTDLv2Egg = z.infer<typeof PTDLv2EggSchema>;
