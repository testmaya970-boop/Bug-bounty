import "server-only";
import { withActorTransaction, withServiceRoleTransaction } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { revokeAllSessionsForUser } from "@/lib/auth/session";
import { getCurrentUser, getCurrentSessionId } from "@/lib/auth/current-user";
import { AuthServiceError, signOut } from "@/services/auth";

export { AuthServiceError };

/**
 * In-session password and email change, plus self-service account deactivation. See
 * docs/decisions/0055 for why hard deletion is not implemented (nearly every foreign key
 * from a user's own real activity is `on delete restrict`).
 */

async function requireCurrentUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new AuthServiceError("Sign in again to continue.", "AUTH_REQUIRED");
  return user.id;
}

/**
 * Authorized by the caller's own current, already-authenticated session -- same contract
 * as the original Supabase-backed updateUser({ password }): no current-password
 * re-confirmation is required beyond the session itself. Unlike resetPasswordAction
 * (services/auth.ts), which requires a fresh reset-token instead of a session. Revokes
 * every OTHER session for this account (never the caller's own current one, unlike a
 * password reset, which revokes all of them -- a reset implies "I may not trust any prior
 * session," while an in-session change does not) so a stolen, still-logged-in session
 * elsewhere is cut off the moment the real owner changes their password.
 */
export async function changeMyPassword(newPassword: string): Promise<void> {
  const userId = await requireCurrentUserId();
  const currentSessionId = await getCurrentSessionId();
  const passwordHash = await hashPassword(newPassword);

  // `authenticated` has SELECT only on public.users (see
  // db/migrations/202608260002_data_api_table_grants.sql), and public.sessions is
  // service_role-only entirely -- both statements below need service_role, not
  // RLS-scoped authenticated. requireCurrentUserId() above is what actually authorizes
  // this (an already-validated session), same as the RLS-based check would have.
  await withServiceRoleTransaction(async (client) => {
    await client.query("update public.users set password_hash = $1, must_reset_password = false, updated_at = now() where id = $2", [passwordHash, userId]);
    if (currentSessionId) {
      await client.query("delete from public.sessions where user_id = $1 and id <> $2", [userId, currentSessionId]);
    } else {
      await revokeAllSessionsForUser(client, userId);
    }
  });
}

/**
 * Single-step email change, authorized by the caller's own current session -- a reduced
 * scope placeholder for Supabase's own real double-confirmation flow (both the old and
 * new address had to click a confirmation link before the change took effect). Full
 * double-confirmation is a real sub-feature of its own scope and is explicitly deferred,
 * not silently dropped: this still requires an authenticated session and rejects a
 * duplicate/invalid address, but the address changes immediately rather than after a
 * confirmation round trip. Track re-implementing the original double-confirm guarantee as
 * a dedicated follow-up before this ships to a real deployment with existing users.
 */
export async function changeMyEmail(newEmail: string): Promise<void> {
  const userId = await requireCurrentUserId();
  const normalizedEmail = newEmail.trim().toLowerCase();

  try {
    // Same reasoning as changeMyPassword above: authenticated has SELECT-only on
    // public.users, so this UPDATE requires service_role.
    await withServiceRoleTransaction(async (client) => {
      await client.query("update public.users set email = $1, email_verified_at = null, updated_at = now() where id = $2", [normalizedEmail, userId]);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("duplicate key") || message.includes("users_email_key")) {
      throw new AuthServiceError("An account with this email already exists.", "EMAIL_TAKEN");
    }
    throw new AuthServiceError("The request could not be completed. Try again in a moment.", "UNKNOWN");
  }
}

/** Real, immediate: calls the existing public.deactivate_my_account() SECURITY DEFINER
 * function unchanged (it now deletes from public.sessions rather than auth.sessions --
 * see db/migrations/202609020003_settings_platform_expansion.sql's own edit note; the
 * function body's authorization logic itself is untouched). Signs the caller's own
 * client out right after, since the server-side session row is already gone -- this
 * just clears the local cookie state to match. */
export async function deactivateMyAccount(): Promise<void> {
  const userId = await requireCurrentUserId();

  await withActorTransaction(userId, async (client) => {
    await client.query("select public.deactivate_my_account()");
  });
  await signOut();
}
