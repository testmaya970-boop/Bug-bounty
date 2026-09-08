import "server-only";
import { headers, cookies } from "next/headers";
import { withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { issuePasswordResetToken, consumePasswordResetToken, peekPasswordResetToken as peekPasswordResetTokenLib } from "@/lib/auth/tokens";
import { generateSignupOtpChallenge, hashSignupOtpCode } from "@/lib/auth/signup-otp";
import { createSession, revokeSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getCurrentSessionId } from "@/lib/auth/current-user";
import { activeEmailProvider } from "@/lib/email-provider";
import { randomUUID } from "node:crypto";

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

async function requestOrigin(): Promise<string> {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

async function setSessionCookie(cookieValue: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

async function currentUserAgentAndIp(): Promise<{ userAgent: string | null; ip: string | null }> {
  const h = await headers();
  return { userAgent: h.get("user-agent"), ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null };
}

// Always "confirm_email" now -- unlike Supabase, where a project with email confirmation
// disabled could return an immediate session, there is no equivalent "skip confirmation"
// mode here; every account must confirm its email before first sign-in.
export type SignUpResult = { status: "confirm_email"; email: string };

/**
 * Creates the account (public.create_user, the same username-choice/fallback logic that
 * used to run as an `after insert on auth.users` trigger -- see
 * db/migrations/202608260001_organization_membership_lifecycle.sql's own edit note) and
 * emails a real 6-digit verification code (db/migrations/202609090001_signup_email_otp_verification.sql),
 * sent via the existing activeEmailProvider abstraction (the same one every other
 * transactional email in this app already uses). No session is created yet -- email
 * confirmation is required before first sign-in, matching the original Supabase-backed
 * behavior where `data.session` was null until confirmation.
 *
 * This is a typed code, not a clickable link, per explicit product direction --
 * password reset (requestPasswordReset/confirmPasswordReset below) remains link-based
 * and unchanged; only signup verification uses a code.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  metadata?: { displayName?: string; username?: string; intent?: "researcher" | "organization"; companyName?: string },
): Promise<SignUpResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const { code, codeHash, ttlSeconds } = generateSignupOtpChallenge();

  const userId = await withServiceRoleTransaction(async (client) => {
    let user;
    try {
      const { rows } = await client.query<{ id: string }>(
        "select * from public.create_user($1, $2, $3, $4)",
        [normalizedEmail, passwordHash, metadata?.displayName ?? null, metadata?.username ?? null],
      );
      user = rows[0];
    } catch (error) {
      throw mapDbError(error);
    }
    await callRpc(client, "public.create_signup_verification_challenge", [
      user.id,
      codeHash,
      ttlSeconds,
      JSON.stringify({ intent: metadata?.intent, companyName: metadata?.companyName }),
    ]);
    return user.id;
  });

  await activeEmailProvider.send({
    to: normalizedEmail,
    subject: "Confirm your Sentinel account",
    text: `Your Sentinel verification code is: ${code}\n\nEnter this code to finish creating your account. This code expires in 15 minutes. If you did not create this account, you can ignore this email.`,
    idempotencyKey: `signup-verify-${userId}-${randomUUID()}`,
  });

  return { status: "confirm_email", email: normalizedEmail };
}

/**
 * Rate-limited by the normalized email being attempted (public.check_sign_in_rate_limit,
 * unchanged/fully portable SQL -- see db/migrations/202609070003_native_auth_tokens.sql's
 * own note). Returns `{ mfaRequired: true }` when this account has a verified email-OTP
 * factor -- the session row is created either way (the password was correct), but
 * remains at aal1 until a real OTP verification elevates it (services/mfa.ts); the
 * caller must route to /mfa/verify rather than treat the account as fully signed in.
 */
export async function signInWithPassword(email: string, password: string): Promise<{ mfaRequired: boolean; userId: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  return withServiceRoleTransaction(async (client) => {
    const { rows: rateLimitRows } = await client.query<{ check_sign_in_rate_limit: boolean }>(
      "select public.check_sign_in_rate_limit($1)",
      [normalizedEmail],
    );
    if (rateLimitRows[0]?.check_sign_in_rate_limit === false) {
      throw new AuthServiceError("Too many sign-in attempts. Wait a moment and try again.", "RATE_LIMITED");
    }

    // must_reset_password accounts (migrated from Supabase Auth, see
    // scripts/migrate-users-data.mjs) carry an unguessable, never-verifiable
    // password_hash -- verifyPassword below always returns false for them, so they
    // correctly cannot sign in with any password, same as a wrong-password attempt.
    // Deliberately NOT distinguished from INVALID_CREDENTIALS here: revealing
    // "this account requires a reset" before a correct password is known would be a
    // new account-enumeration side channel, which this codebase's existing
    // enumeration-safety convention (see mapAuthError's own history) treats as a real
    // security property, not a UX nicety to trade away. A migrated user's real path in
    // is the password-reset flow, reachable the same way any user reaches it.
    const { rows: userRows } = await client.query<{ id: string; password_hash: string; email_verified_at: string | null; deactivated_at: string | null }>(
      "select id, password_hash, email_verified_at, deactivated_at from public.users where email = $1",
      [normalizedEmail],
    );
    const user = userRows[0];
    // Constant-shape failure regardless of whether the account exists -- verifyPassword
    // against a fixed dummy hash keeps the timing profile of "no such account" close to
    // "wrong password" rather than short-circuiting immediately, the same enumeration
    // caution the original Supabase-backed mapAuthError already documented.
    const passwordOk = user ? await verifyPassword(user.password_hash, password) : await verifyPassword(DUMMY_HASH_FOR_TIMING, password);
    if (!user || !passwordOk) {
      throw new AuthServiceError("Incorrect email or password.", "INVALID_CREDENTIALS");
    }
    if (!user.email_verified_at) {
      throw new AuthServiceError("Confirm your email address before signing in.", "EMAIL_NOT_CONFIRMED");
    }
    if (user.deactivated_at) {
      throw new AuthServiceError("Incorrect email or password.", "INVALID_CREDENTIALS");
    }

    const { userAgent, ip } = await currentUserAgentAndIp();
    const { cookieValue } = await createSession(client, { userId: user.id, userAgent, ip });
    await setSessionCookie(cookieValue);

    const { rows: mfaRows } = await client.query<{ user_id: string }>(
      "select user_id from public.mfa_factors where user_id = $1 and status = 'verified'",
      [user.id],
    );
    return { mfaRequired: mfaRows.length > 0, userId: user.id };
  });
}

// A real argon2id hash of an unguessable, fixed placeholder -- computed once at module
// load, never derived from any real account's data. Its only purpose is to make
// signInWithPassword's argon2.verify() call take approximately the same amount of time
// whether or not the email actually exists (verifyPassword's own null/"no account" fast
// path would otherwise be measurably faster, a timing side-channel).
const DUMMY_HASH_FOR_TIMING = "$argon2id$v=19$m=65536,t=3,p=4$c2VudGluZWwtZHVtbXktc2FsdA$3vJ8y2vXQ5nOe1nJc4h8pQqvR5xY0oW1kQpZ2z6l0zM";

function mapDbError(error: unknown): AuthServiceError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("EMAIL_TAKEN")) return new AuthServiceError("An account with this email already exists.", "EMAIL_TAKEN");
  // signup-verification-challenge RPC errors (create_signup_verification_challenge/
  // verify_signup_verification_challenge) follow this schema's standard `CODE: message`
  // convention -- parsed the same way services/rpc-error.ts's mapRpcError does for every
  // other RPC, just producing an AuthServiceError here rather than an
  // OrganizationServiceError, matching this file's own established convention (see this
  // module's own historical note in services/rpc-error.ts on why auth errors are mapped
  // separately from the rest of this schema's RPCs).
  const match = /^([A-Z_]+): (.+)$/.exec(message);
  if (match) return new AuthServiceError(match[2], match[1]);
  return new AuthServiceError("The request could not be completed. Try again in a moment.", "UNKNOWN");
}

/**
 * Always neutral to the caller regardless of whether the email belongs to a real,
 * unconfirmed account -- looked up but never distinguished in the response; only a
 * genuine rate limit is ever distinguishable, identical to requestPasswordReset's
 * contract and this codebase's existing enumeration-safety convention. Re-issues a fresh
 * 6-digit code (create_signup_verification_challenge invalidates any still-live code
 * before issuing a new one, so only the most recently sent code is ever valid) rather
 * than re-sending a link.
 */
export async function resendConfirmationEmail(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const { code, codeHash, ttlSeconds } = generateSignupOtpChallenge();

  await withServiceRoleTransaction(async (client) => {
    const { rows } = await client.query<{ id: string; email_verified_at: string | null }>(
      "select id, email_verified_at from public.users where email = $1",
      [normalizedEmail],
    );
    const user = rows[0];
    if (!user || user.email_verified_at) return;

    try {
      await callRpc(client, "public.create_signup_verification_challenge", [user.id, codeHash, ttlSeconds, "{}"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A genuine rate limit is the one outcome this function's own caller (resendConfirmationEmailAction)
      // still surfaces distinguishably -- everything else (including a race where the
      // account was verified between the select above and this call) resolves to the
      // identical neutral no-op, matching this function's own documented contract.
      if (message.startsWith("RATE_LIMITED")) throw new AuthServiceError("Too many codes requested. Wait a few minutes and try again.", "RATE_LIMITED");
      return;
    }

    await activeEmailProvider.send({
      to: normalizedEmail,
      subject: "Confirm your Sentinel account",
      text: `Your Sentinel verification code is: ${code}\n\nEnter this code to finish creating your account. This code expires in 15 minutes.`,
      idempotencyKey: `signup-verify-resend-${user.id}-${randomUUID()}`,
    });
  });
}

/**
 * Always neutral to the caller regardless of whether the email belongs to a real
 * account -- no enumeration signal exists to suppress here since the lookup happens
 * before any distinguishable response is produced.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const origin = await requestOrigin();

  await withServiceRoleTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>("select id from public.users where email = $1", [normalizedEmail]);
    const user = rows[0];
    if (!user) return;

    const token = await issuePasswordResetToken(client, user.id);
    const resetUrl = `${origin}/auth/confirm?type=recovery&token=${encodeURIComponent(token)}`;
    await activeEmailProvider.send({
      to: normalizedEmail,
      subject: "Reset your Sentinel password",
      text: `Reset your Sentinel password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
      idempotencyKey: `password-reset-${user.id}-${randomUUID()}`,
    });
  });
}

/**
 * Verifies the emailed 6-digit code against the account's live challenge
 * (db/migrations/202609090001_signup_email_otp_verification.sql) and establishes a real
 * session on success -- the verify-code page/action calls this, not password-reset (that
 * remains link-based, see peekPasswordResetToken/confirmPasswordReset below, unchanged).
 * Requires `email` (not a session -- none exists yet) to resolve which account's
 * challenge to check; the challenge itself is still what actually authorizes the
 * verification (ownership is enforced by the RPC matching on the resolved user id, never
 * by trusting the email alone) -- a wrong email simply resolves to no account, which
 * verify_signup_verification_challenge already treats identically to "no live challenge"
 * (the same enumeration-safe INVALID_CODE outcome).
 */
export async function verifySignupCode(email: string, code: string): Promise<{ userId: string; intent?: "researcher" | "organization"; companyName?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const codeHash = hashSignupOtpCode(code);

  const result = await withServiceRoleTransaction(async (client) => {
    const { rows: userRows } = await client.query<{ id: string }>("select id from public.users where email = $1", [normalizedEmail]);
    const user = userRows[0];
    if (!user) throw new AuthServiceError("That code didn't match or has expired. Request a new one and try again.", "INVALID_CODE");

    let rows;
    try {
      rows = await callRpc<{ outcome: string; metadata: { intent?: "researcher" | "organization"; companyName?: string } }>(
        client,
        "public.verify_signup_verification_challenge",
        [user.id, codeHash],
      );
    } catch (error) {
      throw mapDbError(error);
    }
    const row = rows[0];
    if (!row || row.outcome !== "valid") throw new AuthServiceError("That code didn't match or has expired. Request a new one and try again.", "INVALID_CODE");

    return { userId: user.id, intent: row.metadata?.intent, companyName: row.metadata?.companyName };
  });

  return result;
}

/** Verifies a password-reset token without consuming it yet -- confirmPasswordReset
 * below re-verifies and consumes atomically once the new password is known, so a token
 * viewed but not used (e.g. the reset page loaded but the form never submitted) is not
 * burned by merely checking it exists. This function is read-only: it never mutates
 * consumed_at, matching that intent. */
export async function peekPasswordResetToken(token: string): Promise<{ userId: string } | null> {
  return withServiceRoleTransaction((client) => peekPasswordResetTokenLib(client, token));
}

/**
 * Establishes a real session for a just-verified account -- replacing Supabase's own
 * "verifyOtp establishes a session as a side effect" behavior. Called from
 * actions/auth.ts's verifySignupCodeAction (the 6-digit signup verification path) and
 * app/auth/confirm/route.ts (the still-link-based password-reset path, which itself
 * never establishes a session -- see that route's own comment).
 */
export async function establishSessionForUser(userId: string): Promise<void> {
  const { userAgent, ip } = await currentUserAgentAndIp();
  await withServiceRoleTransaction(async (client) => {
    const { cookieValue } = await createSession(client, { userId, userAgent, ip });
    await setSessionCookie(cookieValue);
  });
}

/**
 * Requires a valid, unconsumed password-reset token -- unlike changeMyPassword
 * (services/account.ts), which requires an existing authenticated session instead. Two
 * real, distinct paths to the same underlying password change. Consumes the token
 * atomically with the password update so it can never be replayed even if the request is
 * somehow retried.
 */
export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);

  const userId = await withServiceRoleTransaction(async (client) => {
    const result = await consumePasswordResetToken(client, token);
    if (!result) {
      throw new AuthServiceError("This link has expired or was already used. Request a new one.", "SESSION_EXPIRED");
    }
    await client.query("update public.users set password_hash = $1, must_reset_password = false, updated_at = now() where id = $2", [passwordHash, result.userId]);
    return result.userId;
  });

  // Every existing session is revoked on password reset -- a leaked/shared session
  // cookie is worthless the moment the real owner resets their password, and this
  // matches the original Supabase-backed resetPasswordAction's own "sign the recovery
  // session out immediately after" behavior (there it was one session; here it is every
  // session, which is strictly the safer version of the same intent). public.sessions
  // is service_role-only (no grant to authenticated at all -- see
  // db/migrations/202609020001_account_security_mfa_sessions.sql), so this is
  // withServiceRoleTransaction, not withActorTransaction.
  await withServiceRoleTransaction(async (client) => {
    await client.query("delete from public.sessions where user_id = $1", [userId]);
  });
}

export async function signOut(): Promise<void> {
  const sessionId = await getCurrentSessionId();
  if (sessionId) {
    await withServiceRoleTransaction((client) => revokeSession(client, sessionId));
  }
  await clearSessionCookie();
}
