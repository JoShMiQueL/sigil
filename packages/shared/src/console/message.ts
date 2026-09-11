import { z } from "zod";

// WebSocket message types (browser ↔ daemon)

// Daemon → browser: console output
export const ConsoleOutputMessageSchema = z.object({
  type: z.literal("output"),
  stream: z.enum(["stdout", "stderr"]),
  text: z.string(),
  timestamp: z.number().int(),
});
export type ConsoleOutputMessage = z.infer<typeof ConsoleOutputMessageSchema>;

// Browser → daemon: command to send to container stdin
export const ConsoleCommandMessageSchema = z.object({
  type: z.literal("command"),
  text: z.string().max(4096),
});
export type ConsoleCommandMessage = z.infer<typeof ConsoleCommandMessageSchema>;

// Daemon → browser: resource stats (every 5 seconds)
export const ServerStatsMessageSchema = z.object({
  type: z.literal("stats"),
  cpuPct: z.number().min(0).max(100),
  memoryMb: z.number().min(0),
  memoryLimitMb: z.number().min(0),
  diskMb: z.number().min(0),
  diskLimitMb: z.number().min(0),
  timestamp: z.number().int(),
});
export type ServerStatsMessage = z.infer<typeof ServerStatsMessageSchema>;

// Daemon → browser: error
export const ConsoleErrorMessageSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});
export type ConsoleErrorMessage = z.infer<typeof ConsoleErrorMessageSchema>;

// Union for daemon → browser messages
export const DaemonToBrowserMessageSchema = z.discriminatedUnion("type", [
  ConsoleOutputMessageSchema,
  ServerStatsMessageSchema,
  ConsoleErrorMessageSchema,
]);
export type DaemonToBrowserMessage = z.infer<typeof DaemonToBrowserMessageSchema>;

// Browser → daemon: only commands
export const BrowserToDaemonMessageSchema = ConsoleCommandMessageSchema;
export type BrowserToDaemonMessage = z.infer<typeof BrowserToDaemonMessageSchema>;
