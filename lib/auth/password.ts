import "server-only";
import argon2 from "argon2";

// OWASP-recommended Argon2id parameters (64 MiB, 3 iterations, 4 lanes).
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burn the same CPU time as a real verification when the account does not exist,
 * so login response timing does not reveal which emails are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy-password-for-timing-equalisation");
  await verifyPassword(password, await dummyHash);
  return false;
}
