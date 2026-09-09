import { db, schema } from "@sigilpanel/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/argon2";

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@sigilpanel.local";
  const password = process.env.ADMIN_PASSWORD ?? "admin12345";
  const username = "admin";

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existing) {
    console.log(`Admin user already exists: ${email}`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);

  await db.insert(schema.users).values({
    email,
    username,
    passwordHash,
    role: "admin",
    status: "active",
  });

  console.log(`Admin user created:`);
  console.log(`  Email: ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Username: ${username}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to seed admin:", err);
  process.exit(1);
});
