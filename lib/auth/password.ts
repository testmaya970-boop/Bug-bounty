import "server-only";
import argon2 from "argon2";

/** Real password hashing, replacing GoTrue's own (internal, never exposed) hashing.
 * argon2id, the modern default -- see the migration plan's rationale (tunable memory
 * cost, no bcrypt 72-byte truncation footgun). */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

/** Never throws on a malformed/foreign hash (e.g. a migrated account's forced-reset
 * sentinel) -- returns false, identical to a genuine mismatch, so a caller never needs a
 * separate try/catch to distinguish "wrong password" from "unexpected hash format." */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
