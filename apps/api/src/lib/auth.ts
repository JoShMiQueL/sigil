import { db } from "@sigil/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { hashPassword, verifyPassword } from "./argon2";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    passwordHashing: {
      hash: hashPassword as (password: string) => Promise<string>,
      verify: verifyPassword as (hash: string, password: string) => Promise<boolean>,
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
    expiresIn: 60 * 60 * 24,
    updateAge: 60 * 60,
  },
  advanced: {
    cookies: {
      sessionToken: {
        name: "sigil_session",
        sameSite: "lax",
        secure: true,
        httpOnly: true,
      },
    },
  },
});
