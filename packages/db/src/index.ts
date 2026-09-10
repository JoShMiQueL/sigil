import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { apiKeys } from "./schema/api-keys";
import { auditLogs } from "./schema/audit-logs";
import { groups } from "./schema/groups";
import { nodeCredentials } from "./schema/node-credentials";
import { nodes } from "./schema/nodes";
import { pairingTokens } from "./schema/pairing-tokens";
import { passwordResetTokens } from "./schema/password-reset-tokens";
import { regions } from "./schema/regions";
import { registries } from "./schema/registries";
import { sessions } from "./schema/sessions";
import { templates } from "./schema/templates";
import { users } from "./schema/users";
import { variables } from "./schema/variables";

export const schema = {
  users,
  sessions,
  apiKeys,
  passwordResetTokens,
  auditLogs,
  regions,
  nodes,
  pairingTokens,
  nodeCredentials,
  groups,
  templates,
  variables,
  registries,
};

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://sigilpanel:sigilpanel@localhost:5432/sigilpanel";

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });

export type DB = typeof db;
