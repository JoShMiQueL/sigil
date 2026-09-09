import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as apiKeys from "./schema/api-keys";
import * as passwordResetTokens from "./schema/password-reset-tokens";
import * as sessions from "./schema/sessions";
import * as users from "./schema/users";

export const schema = {
  users,
  sessions,
  apiKeys,
  passwordResetTokens,
};

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://sigilpanel:sigilpanel@localhost:5432/sigilpanel";

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });

export type DB = typeof db;
