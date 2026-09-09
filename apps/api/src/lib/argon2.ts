import { hash, verify } from "@node-rs/argon2";

// Argon2id = 2 (from @node-rs/argon2 Algorithm enum)
// Can't use Algorithm.Argon2id directly because isolatedModules doesn't allow const enums
const ARGON2ID = 2 as const;

const params = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  algorithm: ARGON2ID,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, params);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  return verify(hashed, password);
}
