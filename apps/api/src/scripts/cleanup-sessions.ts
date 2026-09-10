import { db, schema } from "@sigil/db";
import { lt } from "drizzle-orm";

async function cleanupExpiredSessions(): Promise<number> {
  const result = await db
    .delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, new Date()))
    .returning();

  return result.length;
}

if (process.env.NODE_ENV !== "test") {
  cleanupExpiredSessions()
    .then((count) => {
      console.log(`Cleaned up ${count} expired sessions`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed to cleanup sessions:", err);
      process.exit(1);
    });
}

export { cleanupExpiredSessions };
