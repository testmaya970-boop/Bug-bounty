import "server-only";
import { activeEmailProvider } from "@/lib/email-provider";
import { getNativeEnv } from "@/lib/env";

/**
 * Sends an invitation email and says whether it actually went out. The provider reports a
 * rejected send as a result, not an exception, so both are checked: an inviter must never be
 * told "sent" for a message that bounced at the provider. The invitation row is already
 * committed either way, and the caller shows the link so it can be shared by hand.
 * Plain text; the subject has CR/LF stripped (organization-supplied names go in it).
 */
export async function sendInvitationEmail(input: { to: string; subject: string; text: string; idempotencyKey: string }): Promise<boolean> {
  try {
    const result = await activeEmailProvider.send({ ...input, subject: input.subject.replace(/[\r\n]+/g, " ").trim() });
    return result.success;
  } catch {
    return false;
  }
}

export function invitationUrl(path: string): string {
  return `${getNativeEnv().APP_ORIGIN}${path}`;
}
