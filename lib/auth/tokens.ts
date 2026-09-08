import "server-only";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Password-reset link tokens -- signup verification uses a typed 6-digit code instead
 * (public.signup_verification_challenges, lib/auth/signup-otp.ts), per explicit product
 * direction; only password reset remains link-based here. Only the SHA-256 hash of the
 * token is ever persisted -- identical convention to mfa_backup_codes/
 * organization_invitations elsewhere in this schema. The raw token is returned once, for
 * embedding in an emailed link; it can never be recovered from the database afterward.
 */
export async function issuePasswordResetToken(client: PoolClient, userId: string): Promise<string> {
  const token = generateToken();
  await client.query(
    `insert into public.password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')`,
    [userId, hashToken(token)],
  );
  return token;
}

type TokenLookupResult = { userId: string } | null;

/**
 * Single-use: marks the token consumed in the same call that verifies it, inside the
 * caller's own transaction, so a token can never be raced/replayed between the check and
 * the consume step. Returns null for a missing, already-consumed, or expired token --
 * callers never need to distinguish those cases (mirrors services/auth.ts's existing
 * "This link has expired or was already used" messaging, which never told a real reason
 * apart from a fabricated one either, on Supabase).
 */
export async function consumePasswordResetToken(client: PoolClient, token: string): Promise<TokenLookupResult> {
  const { rows } = await client.query<{ user_id: string }>(
    `update public.password_reset_tokens
     set consumed_at = now()
     where token_hash = $1 and consumed_at is null and expires_at > now()
     returning user_id`,
    [hashToken(token)],
  );
  const row = rows[0];
  return row ? { userId: row.user_id } : null;
}

/** Read-only check: does this password-reset token exist, unconsumed, unexpired --
 * without consuming it. Used by the reset-password page to validate a token before
 * showing the "choose a new password" form, so merely loading that page never burns the
 * token (confirmPasswordResetToken below re-checks and consumes atomically once the new
 * password is actually submitted). */
export async function peekPasswordResetToken(client: PoolClient, token: string): Promise<TokenLookupResult> {
  const { rows } = await client.query<{ user_id: string }>(
    `select user_id from public.password_reset_tokens where token_hash = $1 and consumed_at is null and expires_at > now()`,
    [hashToken(token)],
  );
  const row = rows[0];
  return row ? { userId: row.user_id } : null;
}

/** Not used for token verification (the UPDATE...RETURNING lookup by hash above is
 * already constant-time from an attacker's perspective -- a hash comparison happens
 * inside Postgres's own index lookup, not in application code). Exported for
 * parity/testing use where a raw constant-time compare is genuinely needed. */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
