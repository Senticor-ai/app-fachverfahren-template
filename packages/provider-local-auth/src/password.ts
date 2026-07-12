import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing (kanban plan decision 2 — chosen explicitly over
 * a vague "argon2/bcrypt" default). Uses `@node-rs/argon2`'s prebuilt native
 * bindings rather than a pure-JS implementation or a package requiring a
 * local C++ toolchain.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (!password) {
    return false;
  }
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
