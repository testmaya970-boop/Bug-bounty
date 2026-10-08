import "server-only";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { getCurrentUser, getCurrentSessionId } from "@/lib/auth/current-user";
import { elevateSessionToAal2 } from "@/lib/auth/session";
import { generateOtpChallenge, hashOtpCode } from "@/lib/auth/mfa-otp";
import { activeEmailProvider } from "@/lib/email-provider";
import { generateTotpSecret, totpUri } from "@/lib/auth/totp";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";

export { OrganizationServiceError };

/**
 * Email-OTP MFA -- replaces GoTrue's own `auth.mfa.*` TOTP API entirely. There is no QR
 * code, no authenticator app, no client-side secret: enrollment and sign-in-time
 * verification are both "generate a 6-digit code, hash it, email it to the account's own
 * registered address via the existing activeEmailProvider abstraction, and verify the
 * hash server-side against public.mfa_challenges" (db/migrations/202609080001_email_otp_mfa.sql).
 * Only the SHA-256 hash of a code is ever persisted -- identical convention to
 * mfa_backup_codes/email_verification_tokens/password_reset_tokens elsewhere in this
 * schema. See docs/decisions/0052.
 */

async function requireCurrentUser(): Promise<{ id: string; email: string | null }> {
  const user = await getCurrentUser();
  if (!user) throw new OrganizationServiceError("Sign in again to continue.", "AUTH_REQUIRED");
  return user;
}

export type MfaMethod = "email" | "totp";
export type MfaFactor = { id: string; status: "verified" | "unverified"; createdAt: string; method: MfaMethod };

export async function listMyMfaFactors(): Promise<MfaFactor[]> {
  const user = await requireCurrentUser();
  let rows: { id: string; status: string; created_at: string; method: string }[];
  try {
    rows = await withActorTransaction(user.id, (client) => callRpc(client, "public.list_my_mfa_factors"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ id: row.id, status: row.status as MfaFactor["status"], createdAt: row.created_at, method: row.method as MfaMethod }));
}

async function sendOtpEmail(email: string, code: string, purpose: "enroll" | "verify"): Promise<void> {
  const subject = purpose === "enroll" ? "Confirm two-factor authentication" : "Your Unpatched sign-in code";
  await activeEmailProvider.send({
    to: email,
    subject,
    text: `Your Unpatched verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, you can ignore this email.`,
    idempotencyKey: `mfa-${purpose}-${randomUUID()}`,
  });
}

/** Starts enrollment: generates a real 6-digit code, persists only its hash
 * (public.create_mfa_challenge, purpose 'enroll' -- also creates the unverified
 * mfa_factors row), and emails the plaintext code to the account's own registered
 * email -- never an address supplied by the caller, so a compromised session alone can
 * never redirect where the code is delivered. `factorId` is the account's own user id
 * (this schema tracks at most one email factor per user); callers already treat it as
 * opaque, so this is a transparent substitution for GoTrue's own per-enrollment factor
 * id. */
export type MfaEnrollment = { factorId: string };

export async function beginMfaEnrollment(): Promise<MfaEnrollment> {
  const user = await requireCurrentUser();
  if (!user.email) throw new OrganizationServiceError("Add an email address to your account before enabling two-factor authentication.", "EMAIL_REQUIRED");

  const { code, codeHash, ttlSeconds } = generateOtpChallenge();
  try {
    await withActorTransaction(user.id, (client) => callRpc(client, "public.create_mfa_challenge", ["enroll", codeHash, ttlSeconds]));
  } catch (error) {
    mapError(error as { message: string });
  }
  await sendOtpEmail(user.email, code, "enroll");
  return { factorId: user.id };
}

/** Real verification: checks the emailed code's hash against the live challenge row
 * (public.verify_mfa_challenge), enforcing single-use, expiry, attempt limits, and
 * ownership entirely server-side -- never a client-side code check. On success this also
 * marks the factor verified (enroll) and, for the sign-in-time gate, elevates the
 * current session to aal2 (lib/auth/session.ts's elevateSessionToAal2), mirroring
 * GoTrue's own "only a real second-factor verification sets aal2" invariant. `factorId`
 * is accepted for interface compatibility with every existing caller but is not itself
 * looked up -- the challenge is scoped to the authenticated actor via auth.uid(), never
 * a client-supplied id. */
export async function confirmMfaEnrollment(factorId: string, code: string): Promise<void> {
  return verifySecondFactor(code);
}

/** The sign-in-time check -- identical mechanics as enrollment confirmation, just
 * reached from a different page (/mfa/verify instead of /settings). */
export async function verifyMfaCode(factorId: string, code: string): Promise<void> {
  return verifySecondFactor(code);
}

/** Routes a 6-digit code to the account's own method -- never one the caller picks, so an
 * authenticator account can't be verified with an emailed code. */
async function verifySecondFactor(code: string): Promise<void> {
  const factors = await listMyMfaFactors();
  return factors[0]?.method === "totp" ? verifyTotpCode(code) : verifyChallengeCode(code);
}

export type TotpEnrollment = { factorId: string; secret: string; qrSvg: string };

/** Starts authenticator-app enrollment: a fresh secret is stored (encrypted, unverified)
 * and returned once, as a setup key and QR code, for the user to add to their app. The
 * factor turns verified only when a real code from that app is confirmed. */
export async function beginTotpEnrollment(): Promise<TotpEnrollment> {
  const user = await requireCurrentUser();
  const secret = generateTotpSecret();
  try {
    await withActorTransaction(user.id, (client) => callRpc(client, "public.begin_my_totp_enrollment", [secret.hex]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const qrSvg = await QRCode.toString(totpUri(user.email ?? user.id, secret.base32), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { factorId: user.id, secret: secret.base32, qrSvg };
}

async function verifyTotpCode(code: string): Promise<void> {
  const user = await requireCurrentUser();
  const sessionId = await getCurrentSessionId();
  let outcome: string;
  try {
    const rows = await withActorTransaction(user.id, (client) => callRpc<{ verify_my_totp_code: string }>(client, "public.verify_my_totp_code", [code]));
    outcome = rows[0]?.verify_my_totp_code;
  } catch (error) {
    mapError(error as { message: string });
  }
  if (outcome === "rate_limited") throw new OrganizationServiceError("Too many wrong codes. Wait 15 minutes and try again.", "RATE_LIMITED");
  if (outcome === "invalid") throw new OrganizationServiceError("That code didn't match. Enter the current code from your authenticator app.", "INVALID_CODE");
  // Same as an emailed code: a real second factor elevates this session (see verifyChallengeCode).
  if (sessionId) await withServiceRoleTransaction((client) => elevateSessionToAal2(client, sessionId));
}

async function verifyChallengeCode(code: string): Promise<void> {
  const user = await requireCurrentUser();
  const sessionId = await getCurrentSessionId();
  const codeHash = hashOtpCode(code);

  // verify_mfa_challenge looks up the actor's own latest unconsumed challenge internally
  // (auth.uid()-scoped, SECURITY DEFINER) -- it never took a client-supplied challenge id
  // that could be trusted anyway, and create_mfa_challenge already guarantees at most one
  // live challenge per actor. See db/migrations/202610010002_fix_mfa_verify_challenge_lookup.sql:
  // an earlier version pre-fetched the challenge id with a raw SELECT against
  // public.mfa_challenges under the authenticated role, which was never granted access to
  // that table (only service_role was) -- every MFA verification attempt failed with
  // "permission denied for table mfa_challenges" until this was fixed.
  let purpose: string;
  try {
    const rows = await withActorTransaction(user.id, (client) => callRpc<{ verify_mfa_challenge: string }>(client, "public.verify_mfa_challenge", [codeHash]));
    purpose = rows[0]?.verify_mfa_challenge;
  } catch (error) {
    mapError(error as { message: string });
  }

  // verify_mfa_challenge never raises for a wrong/expired/exhausted code (see that
  // function's own header comment: a RAISE from inside the function would silently
  // discard the attempts-increment/consume DML it just performed) -- it returns the
  // plain string 'invalid' instead, mapped to the identical INVALID_CODE contract every
  // caller above this already expects.
  if (purpose === "invalid") throw new OrganizationServiceError("That code didn't match or has expired. Request a new one and try again.", "INVALID_CODE");

  // Both outcomes are a real, server-checked proof of a second factor -- 'enroll' no less
  // than 'verify' -- so both elevate the session. An earlier version elevated only for
  // 'verify', on the theory that enrollment happens from an already-strong session; in
  // reality MfaSettings immediately calls generate_my_mfa_backup_codes right after a
  // successful enroll confirmation, which itself requires aal2 (202609020001) -- so every
  // enrollment's own backup-code step failed with STRONG_AUTH_REQUIRED, which the
  // session-middleware's MFA gate then turned into a redirect a server action can't
  // parse, crashing the page. Confirmed live via Playwright + direct DB verification.
  //
  // withServiceRoleTransaction, not withActorTransaction: public.sessions is granted only
  // to service_role (202609020001), same as every other direct write to this table
  // (createSession/revokeSession/revokeAllSessionsForUser in lib/auth/session.ts, all
  // called under service_role at their own call sites) -- this was the one write against
  // that table still running under `authenticated`, which has no grant on it at all, and
  // failed with "permission denied for table sessions" the moment this code path actually
  // ran (confirmed live). sessionId itself comes from getCurrentSessionId() above, which
  // already resolves it from this request's own validated cookie -- never a client-
  // supplied id -- so there is no new trust boundary crossed by using service_role here.
  if (sessionId) {
    await withServiceRoleTransaction((client) => elevateSessionToAal2(client, sessionId));
  }
}

// Email-OTP MFA has one factor per account, so the RPC needs no factor id.
export async function unenrollMfaFactor(): Promise<void> {
  const user = await requireCurrentUser();
  try {
    await withActorTransaction(user.id, (client) => callRpc(client, "public.unenroll_my_mfa_factor"));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** Requests a fresh sign-in-time code for an already-enrolled account -- the resend path
 * from /mfa/verify. Reuses the same create_mfa_challenge('verify', ...) RPC as the
 * initial challenge middleware's redirect implies is needed; any prior unconsumed
 * 'verify' challenge is invalidated by that RPC before the new one is issued, so only the
 * most recently sent code is ever valid. */
export async function requestMfaVerificationCode(): Promise<void> {
  const user = await requireCurrentUser();
  if (!user.email) throw new OrganizationServiceError("Add an email address to your account before continuing.", "EMAIL_REQUIRED");

  const { code, codeHash, ttlSeconds } = generateOtpChallenge();
  try {
    await withActorTransaction(user.id, (client) => callRpc(client, "public.create_mfa_challenge", ["verify", codeHash, ttlSeconds]));
  } catch (error) {
    mapError(error as { message: string });
  }
  await sendOtpEmail(user.email, code, "verify");
}

export type MfaStatus = { totpEnrolled: boolean; currentAal: "aal1" | "aal2"; sessionVerified: boolean; remainingBackupCodes: number };

export async function getMyMfaStatus(): Promise<MfaStatus> {
  const user = await requireCurrentUser();
  const sessionId = await getCurrentSessionId();
  let row: { totp_enrolled: boolean; current_aal: "aal1" | "aal2"; session_verified: boolean; remaining_backup_codes: number };
  try {
    const rows = await withActorTransaction(user.id, (client) =>
      callRpc<{ totp_enrolled: boolean; current_aal: "aal1" | "aal2"; session_verified: boolean; remaining_backup_codes: number }>(
        client,
        "public.get_my_mfa_status",
        [sessionId],
      ),
    );
    row = rows[0];
  } catch (error) {
    mapError(error as { message: string });
  }
  return { totpEnrolled: row.totp_enrolled, currentAal: row.current_aal, sessionVerified: row.session_verified, remainingBackupCodes: row.remaining_backup_codes };
}

/** Returned once, at generation time, and never again -- only the SHA-256 hash of each
 * code is persisted (202609020001). */
export async function generateMyBackupCodes(): Promise<string[]> {
  const user = await requireCurrentUser();
  const sessionId = await getCurrentSessionId();
  let codes: string[];
  try {
    const rows = await withActorTransaction(user.id, (client) => callRpc<{ generate_my_mfa_backup_codes: string[] }>(client, "public.generate_my_mfa_backup_codes", [sessionId]));
    codes = rows[0]?.generate_my_mfa_backup_codes ?? [];
  } catch (error) {
    mapError(error as { message: string });
  }
  return codes ?? [];
}

export async function clearMyBackupCodes(): Promise<void> {
  const user = await requireCurrentUser();
  try {
    await withActorTransaction(user.id, (client) => callRpc(client, "public.clear_my_mfa_backup_codes"));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** The backup-code equivalent of a real AAL2 check -- see 202609020001's own comment on
 * why this can't itself mint an AAL2 JWT, and why `mfa_verified_sessions` is an equally
 * real, server-checked alternative rather than a client-trusted flag. */
export async function redeemBackupCode(code: string): Promise<void> {
  const user = await requireCurrentUser();
  const sessionId = await getCurrentSessionId();
  try {
    await withActorTransaction(user.id, (client) => callRpc(client, "public.redeem_mfa_backup_code", [code, sessionId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// ---------------------------------------------------------------------------
// Session/device management (public.sessions, native DB-backed sessions)
// ---------------------------------------------------------------------------

export type MySession = { id: string; createdAt: string; updatedAt: string; userAgent: string | null; ip: string | null; aal: "aal1" | "aal2"; isCurrent: boolean };

export async function listMySessions(): Promise<MySession[]> {
  const user = await requireCurrentUser();
  const sessionId = await getCurrentSessionId();
  let rows: { id: string; created_at: string; updated_at: string; user_agent: string | null; ip: string | null; aal: "aal1" | "aal2"; is_current: boolean }[];
  try {
    rows = await withActorTransaction(user.id, (client) => callRpc(client, "public.list_my_sessions", [sessionId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, userAgent: row.user_agent, ip: row.ip, aal: row.aal, isCurrent: row.is_current }));
}

export async function revokeMySession(sessionId: string): Promise<void> {
  const user = await requireCurrentUser();
  try {
    await withActorTransaction(user.id, (client) => callRpc(client, "public.revoke_my_session", [sessionId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** Returns how many other sessions were revoked. */
export async function revokeAllOtherSessions(): Promise<number> {
  const user = await requireCurrentUser();
  const sessionId = await getCurrentSessionId();
  let count: number;
  try {
    const rows = await withActorTransaction(user.id, (client) => callRpc<{ revoke_all_other_sessions: number }>(client, "public.revoke_all_other_sessions", [sessionId]));
    count = rows[0]?.revoke_all_other_sessions ?? 0;
  } catch (error) {
    mapError(error as { message: string });
  }
  return count;
}
