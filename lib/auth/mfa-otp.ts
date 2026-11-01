import "server-only";
import { randomInt, createHash } from "node:crypto";

const OTP_TTL_SECONDS = 10 * 60;

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** A freshly generated 6-digit code plus its hash and TTL, ready to both email to the
 * user and persist via public.create_mfa_challenge -- mirrors lib/auth/tokens.ts's
 * generate-then-hash shape exactly, just a short numeric code instead of a CSPRNG token
 * (this one is meant to be typed back by hand, not clicked as a link). */
export function generateOtpChallenge(): { code: string; codeHash: string; ttlSeconds: number } {
  const code = generateCode();
  return { code, codeHash: hashOtpCode(code), ttlSeconds: OTP_TTL_SECONDS };
}
