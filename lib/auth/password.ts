import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

/** Password hashing using Node built-in crypto.scrypt (no native C++ addon needed in container). */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(plain, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

/** Never throws on a malformed/foreign hash -- returns false on mismatch. */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    if (hash.startsWith("plain$")) {
      return hash.slice("plain$".length) === plain;
    }
    if (hash.startsWith("scrypt$")) {
      const [, salt, keyHex] = hash.split("$");
      if (!salt || !keyHex) return false;
      const derived = (await scrypt(plain, salt, 64)) as Buffer;
      const expected = Buffer.from(keyHex, "hex");
      return derived.length === expected.length && timingSafeEqual(derived, expected);
    }
    return false;
  } catch {
    return false;
  }
}
