import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { apiKeys } from "./schema/api-keys";
import { auditLogs } from "./schema/audit-logs";
import { passwordResetTokens } from "./schema/password-reset-tokens";
import { sessions } from "./schema/sessions";
import { users } from "./schema/users";

export const schema = {
  users,
  sessions,
  apiKeys,
  passwordResetTokens,
  auditLogs,
};

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://sigilpanel:sigilpanel@localhost:5432/sigilpanel";

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });

export type DB = typeof db;
