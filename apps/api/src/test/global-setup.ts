import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { schema } from "@sigilpanel/db";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = join(__dirname, "../../../../packages/db/drizzle");
const URI_FILE = join(tmpdir(), "sigilpanel-test-db-uri.txt");

export async function setup() {
  process.env.NODE_ENV = "test";

  const container = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("sigilpanel_test")
    .withUsername("sigilpanel")
    .withPassword("sigilpanel")
    .start();

  const connectionString = container.getConnectionUri();
  process.env.DATABASE_URL = connectionString;
  writeFileSync(URI_FILE, connectionString);

  // Run migrations against the Testcontainer
  const client = postgres(connectionString, { max: 5 });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await client.end();

  console.log(`[testcontainers] PostgreSQL ready: ${connectionString}`);

  return async () => {
    await container.stop();
    console.log("[testcontainers] PostgreSQL stopped");
  };
}
