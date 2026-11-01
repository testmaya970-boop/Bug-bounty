import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * The raw token is what goes in the invitation link and is shown to the inviting
 * admin exactly once. Only its SHA-256 hash is ever persisted (see the
 * organization_invitations table) -- a leaked database row cannot be replayed as a
 * working invitation.
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
