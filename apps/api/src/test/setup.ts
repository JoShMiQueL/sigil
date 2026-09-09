import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URI_FILE = join(tmpdir(), "sigilpanel-test-db-uri.txt");

// Ensure DATABASE_URL is set before any test file imports @sigilpanel/db
try {
  const uri = readFileSync(URI_FILE, "utf-8").trim();
  if (uri) {
    process.env.DATABASE_URL = uri;
  }
} catch {
  // global-setup hasn't run yet (e.g., running unit tests only)
}

process.env.NODE_ENV = "test";
