import { createHmac, randomBytes } from "node:crypto";

// Authenticator-app (TOTP, RFC 6238) helpers. Codes are verified in Postgres
// (db/migrations/202610080003_totp_mfa.sql); totpCode here is the same algorithm in Node,
// used by tests to cross-check that implementation.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 20 random bytes (160 bits, RFC 4226's recommended length): hex for storage, base32
 * for the authenticator app. */
export function generateTotpSecret(): { hex: string; base32: string } {
  const bytes = randomBytes(20);
  return { hex: bytes.toString("hex"), base32: base32Encode(bytes) };
}

/** The otpauth:// URI an authenticator app reads from the QR code. */
export function totpUri(accountEmail: string, base32Secret: string): string {
  const label = encodeURIComponent(`Unpatched:${accountEmail}`);
  return `otpauth://totp/${label}?secret=${base32Secret}&issuer=Unpatched&algorithm=SHA1&digits=6&period=30`;
}

export function totpCode(key: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", key).update(counter).digest();
  const offset = h[19] & 15;
  const bin = ((h[offset] & 127) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}
