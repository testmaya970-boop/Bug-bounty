"use server";

import type { Route } from "next";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AuthServiceError, confirmPasswordReset, establishSessionForUser, requestPasswordReset, resendConfirmationEmail, signInWithPassword, signOut, signUpWithPassword, verifySignupCode } from "@/services/auth";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { isSafeRedirect } from "@/lib/auth/safe-redirect";
import { determineDefaultDestination } from "@/lib/auth/default-destination";
import { isBusinessEmail } from "@/lib/auth/business-email";
import { perfTimed } from "@/lib/perf-trace";
import { passwordProblem } from "@/lib/auth/password-policy";
import { captchaConfig, verifyCaptcha } from "@/lib/integrations/captcha";
import { headers } from "next/headers";

export type AuthActionResult = { ok: true; status?: "confirm_email"; email?: string } | { ok: false; code: string; message: string };

// A dedicated result type for signInAction, distinct from AuthActionResult: a successful
// sign-in returns its real destination for the CALLER to hard-navigate to
// (window.location.href), rather than calling next/navigation's redirect() here.
// redirect() inside a Server Action invoked via startTransition (as SignInForm does)
// resolves as a client-side RSC "soft" navigation (Next.js sends an x-action-redirect
// header, then the browser issues a follow-up fetch itself) -- and that follow-up fetch
// was confirmed live, repeatedly, to NOT yet carry the Set-Cookie this same response just
// issued (verified via a raw request-header trace: the POST /sign-in response's
// Set-Cookie is well-formed and the cookie is present in the browser's cookie jar by the
// end of the flow, but the very next GET request's own Cookie header is empty), so the
// destination page's getCurrentUser() sees no session and bounces back to
// /sign-in?redirectTo=<destination> -- 100% reproducible, not intermittent. A real
// top-level browser navigation (a fresh HTTP request the browser issues itself, not a
// fetch Next's client runtime issues on the page's behalf) always correctly includes a
// cookie the immediately-preceding response set; only the client-side RSC-fetch path has
// this gap. See docs/decisions/0077-signin-hard-navigation-cookie-race.md.
export type SignInResult = { ok: true; destination: Route } | { ok: false; code: string; message: string };

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  // Deliberately NOT raised alongside strongPasswordSchema below: this schema also gates
  // signInAction, and a real, already-existing account may have been created under a
  // shorter historical minimum. Raising this would lock out real users over a password
  // that was valid when they chose it -- the real credential check is Supabase Auth
  // itself; this is just "did you type something."
  password: z.string().min(8, "Use at least 8 characters."),
});

// Real, enforced-server-side minimum for every password *creation* moment (signup, reset)
// -- see supabase/config.toml's own `minimum_password_length = 12`, raised alongside this
// so the client-visible requirement and the actual backend check never disagree (the
// exact anti-pattern 0023 rejected: a UI implying a rule the backend doesn't check).
// Length-first, still no fabricated composition rule (`password_requirements` stays
// empty) -- current OWASP/NIST guidance treats length as the primary real strength
// signal; a longer minimum is a genuine security improvement, a composition requirement
// mostly is not. See docs/decisions/0053.
// Composition rule added on product direction (2026-10-08): letter + number + special
// character on top of the 12-character minimum -- see lib/auth/password-policy.ts.
const strongPasswordSchema = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

const usernamePattern = /^[a-zA-Z0-9_]{3,32}$/;

const signUpSchema = credentialsSchema.extend({
  password: strongPasswordSchema,
  intent: z.enum(["researcher", "organization"]).optional(),
  displayName: z.string().trim().min(1, "Enter your name.").max(100).optional(),
  username: z.string().trim().toLowerCase().regex(usernamePattern, "Username must be 3-32 characters: letters, numbers, underscore.").optional(),
  companyName: z.string().trim().min(1, "Enter your organization's name.").max(160).optional(),
});

/**
 * `intent` never grants or changes any capability -- create_organization's own
 * authorization is unchanged (any authenticated user may still call it; see
 * docs/decisions/0024/0025) and no organization or role is created here. It only picks
 * which real, already-existing page a freshly-created account lands on: a researcher
 * intent goes to /programs (their actual first workspace), an organization intent goes
 * to /organizations (where "Create organization" is the next real, explicit action a
 * zero-org user already sees) -- the route itself represents intent, per
 * docs/decisions/0030-public-entry-and-two-sided-authentication.md.
 */
export async function signUpAction(input: { email: string; password: string; intent?: "researcher" | "organization"; displayName?: string; username?: string; companyName?: string; captchaToken?: string }): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  // Human check (lib/integrations/captcha.ts): sign-up is where account farms start.
  if (captchaConfig().provider !== "none") {
    const forwarded = (await headers()).get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? null;
    if (!(await verifyCaptcha(input.captchaToken, forwarded))) {
      return { ok: false, code: "CAPTCHA_REQUIRED", message: "Complete the human check, then try again." };
    }
  }

  // Defense in depth: SignUpForm already blocks a free-email-domain submission for
  // intent "organization" client-side; re-checked here since a client check is never a
  // security boundary on its own.
  if (parsed.data.intent === "organization" && !isBusinessEmail(parsed.data.email)) {
    return { ok: false, code: "PERSONAL_EMAIL", message: "Use your work email address to create an organization account." };
  }

  let result;
  try {
    result = await signUpWithPassword(parsed.data.email, parsed.data.password, {
      displayName: parsed.data.displayName,
      username: parsed.data.username,
      intent: parsed.data.intent,
      companyName: parsed.data.companyName,
    });
  } catch (error) {
    if (error instanceof AuthServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }

  // Email confirmation is always required now (no more "auto-confirmed, session
  // returned immediately" branch -- that was specific to a Supabase project having email
  // confirmation disabled, which this app's own signup UX never actually offered as a
  // real path anyway; every real signup already went through the code-verification step
  // below). The organization-auto-creation step for an "organization" intent (see this
  // function's own header comment) now happens in verifySignupCodeAction once the code
  // is actually confirmed, using the intent/companyName carried on the challenge's
  // metadata -- see services/auth.ts's signUpWithPassword.
  return { ok: true, status: "confirm_email", email: result.email };
}

const verifySignupCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code we emailed you."),
  redirectTo: z.string().optional(),
});

/**
 * The signup-time code-verification step -- replaces the old clickable-link
 * app/auth/confirm/route.ts?type=signup path (that route now handles only the
 * still-link-based password-reset redirect, see its own comment). On a correct code,
 * establishes a real session (services/auth.ts's establishSessionForUser) and, for an
 * "organization" intent, auto-creates the organization using the intent/companyName
 * carried on the verification challenge's metadata -- identical best-effort behavior to
 * what the old route did, just reached via a typed code instead of a followed link.
 */
export async function verifySignupCodeAction(input: { email: string; code: string; redirectTo?: string }): Promise<SignInResult> {
  const parsed = verifySignupCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Enter the 6-digit code we emailed you." };

  let result;
  try {
    result = await verifySignupCode(parsed.data.email, parsed.data.code);
  } catch (error) {
    if (error instanceof AuthServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }

  await establishSessionForUser(result.userId);

  let destination = isSafeRedirect(parsed.data.redirectTo) ? parsed.data.redirectTo : await determineDefaultDestination(result.userId);
  if (!parsed.data.redirectTo && result.intent === "organization" && result.companyName) {
    try {
      const organization = await withActorTransaction(result.userId, (client) =>
        callRpc<{ id: string }>(client, "public.create_organization", [result.companyName, randomUUID()]),
      );
      if (organization[0]) destination = `/organizations/${organization[0].id}/members`;
    } catch {
      // best-effort -- the account and its verified email are real either way, so any
      // failure here still lands the user on their real default destination, where
      // "Create organization" is the next visible action, not an error page.
    }
  }
  // Returned, not redirect()ed: same cookie race as signInAction (docs/decisions/0077) --
  // on iPhone Safari the soft navigation dropped the just-set session cookie and bounced
  // the freshly verified account to /sign-in. The caller hard-navigates instead.
  return { ok: true, destination: destination as Route };
}

export async function signInAction(input: { email: string; password: string; redirectTo?: string }): Promise<SignInResult> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  let mfaRequired = false;
  let userId = "";
  try {
    ({ mfaRequired, userId } = await perfTimed("signInAction signInWithPassword", () => signInWithPassword(parsed.data.email, parsed.data.password)));
  } catch (error) {
    if (error instanceof AuthServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }

  const destination = isSafeRedirect(input.redirectTo) ? input.redirectTo : await perfTimed("signInAction determineDefaultDestination", () => determineDefaultDestination(userId));
  // A password-only session for an MFA-enrolled account is deliberately not "signed in"
  // yet from the app's point of view -- /mfa/verify is the only route reachable until a
  // real AAL2 check (TOTP) or an equally real backup-code redemption completes. See
  // docs/decisions/0052.
  //
  // Returns the destination rather than calling redirect() here -- see SignInResult's own
  // comment above for exactly why: redirect() inside this Server Action (invoked via
  // SignInForm's startTransition) resolves as a client-side RSC "soft" navigation whose
  // own follow-up fetch was confirmed live to not yet carry the Set-Cookie this same
  // response just issued. The caller (SignInForm) performs a real hard navigation
  // (window.location.href) instead, which does not have this gap.
  if (mfaRequired) return { ok: true, destination: `/mfa/verify?redirectTo=${encodeURIComponent(destination)}` as Route };
  return { ok: true, destination: destination as Route };
}

/** The caller (components/auth/sign-out-form.tsx) does a full page load to /sign-in. */
export async function signOutAction(): Promise<void> {
  await signOut();
}

const emailOnlySchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.") });

/**
 * Same neutral contract as requestPasswordResetAction just below, for the same reason:
 * resendConfirmationEmail (services/auth.ts) is itself already enumeration-safe -- a
 * malformed email or a real rate limit are the only two outcomes distinguishable from
 * success. See docs/decisions/0052.1.
 */
export async function resendConfirmationEmailAction(input: { email: string }): Promise<AuthActionResult> {
  const parsed = emailOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  try {
    await resendConfirmationEmail(parsed.data.email);
  } catch (error) {
    if (error instanceof AuthServiceError && error.code === "RATE_LIMITED") return { ok: false, code: error.code, message: error.message };
    // Any other failure resolves to the identical neutral success -- see
    // requestPasswordResetAction's own comment for why.
  }
  return { ok: true };
}

/**
 * Always returns `{ ok: true }` for any well-formed email, whether or not it belongs to a
 * real account -- requestPasswordReset itself is already neutral (see services/auth.ts),
 * and this action does not add a second enumeration channel on top of it (e.g. a
 * distinguishable error for "no such account" would defeat the point). A malformed email
 * or a real rate limit are the only two outcomes distinguishable from success, and
 * neither reveals whether any particular account exists.
 */
export async function requestPasswordResetAction(input: { email: string }): Promise<AuthActionResult> {
  const parsed = emailOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  try {
    await requestPasswordReset(parsed.data.email);
  } catch (error) {
    if (error instanceof AuthServiceError && error.code === "RATE_LIMITED") return { ok: false, code: error.code, message: error.message };
    // Any other failure (including one this mapper doesn't recognize) still resolves to
    // the identical neutral success the user sees for a real account -- the alternative
    // (surfacing "something went wrong") would itself be a distinguishable signal an
    // attacker could use to fingerprint which emails cause a different code path.
  }
  return { ok: true };
}

const newPasswordSchema = z.object({ token: z.string().min(1, "This link is invalid."), password: strongPasswordSchema });

/**
 * Requires the token embedded in the emailed reset link -- there is no recovery session
 * to hold one open or sign out anymore (see app/reset-password/page.tsx's own comment on
 * why: a reset link authorizes exactly one action, never a full sign-in).
 * confirmPasswordReset itself already revokes every existing session for the account as
 * part of the reset (services/auth.ts), which is the strictly safer version of the
 * original Supabase-backed flow's "sign the one recovery session out" behavior --
 * SECURITY.md's "recovery... without weakening session invalidation" requirement, same
 * outcome via a different, equally real mechanism.
 */
export async function resetPasswordAction(input: { token: string; password: string }): Promise<AuthActionResult> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await confirmPasswordReset(parsed.data.token, parsed.data.password);
  } catch (error) {
    if (error instanceof AuthServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
  return { ok: true };
}
