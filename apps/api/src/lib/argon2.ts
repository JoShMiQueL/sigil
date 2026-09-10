const params = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: "argon2id",
    ...params,
  });
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  return Bun.password.verify(password, hashed);
}
