import "server-only";
import { randomInt, createHash } from "node:crypto";

const SIGNUP_OTP_TTL_SECONDS = 15 * 60;

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashSignupOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** A freshly generated 6-digit code plus its hash and TTL, ready to both email to the
 * user and persist via public.create_signup_verification_challenge -- mirrors
 * lib/auth/mfa-otp.ts's identical shape exactly (a short numeric code meant to be typed
 * back by hand, not clicked as a link), kept as its own small module rather than reused
 * directly since signup verification's TTL is intentionally longer than MFA's (15
 * minutes vs. 10 -- a first-time signup is more likely to be interrupted by an
 * unfamiliar inbox/spam-folder check than a routine sign-in). */
export function generateSignupOtpChallenge(): { code: string; codeHash: string; ttlSeconds: number } {
  const code = generateCode();
  return { code, codeHash: hashSignupOtpCode(code), ttlSeconds: SIGNUP_OTP_TTL_SECONDS };
}
