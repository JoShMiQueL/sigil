/**
 * E2E test helpers.
 */

const API_URL = "http://localhost:3000";

/**
 * Clean all tables except the admin user.
 * Calls the test-only cleanup endpoint on the API.
 * The endpoint only exists when RATE_LIMIT_DISABLED=1 (E2E mode).
 */
export async function cleanupDatabase(): Promise<void> {
  try {
    await fetch(`${API_URL}/test/cleanup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    // Best-effort: if the API isn't running yet, skip
  }
}
