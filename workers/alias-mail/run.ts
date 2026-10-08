import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { callRpc, withServiceRoleTransaction } from "../outbox/db-pool";
import { getAliasMailConfig, processAliasMessage, type AliasMailConfig, type AliasMailDeps } from "@/lib/alias-mail";
import { classifySmtpFailure } from "@/lib/email-provider";

/**
 * Researcher email alias forwarder for Hostinger Email: `npm run worker:alias-mail`.
 * Polls the alias domain's catch-all mailbox over IMAP, forwards each message to the
 * researcher's real address over SMTP (lib/alias-mail.ts), then files it under
 * "Processed". A message whose forward failed temporarily is left unread for the next
 * poll. One instance is enough; a second would only race to read the same messages, and
 * the single-use token in email_alias_forwards keeps that from double-forwarding.
 */
const PROCESSED = "Processed";
const BATCH = 25;
const pollIntervalMs = Number(process.env.ALIAS_POLL_INTERVAL_MS ?? 30_000);

const config = getAliasMailConfig();
if (!config) {
  console.info("[alias-mail] not configured (ALIAS_EMAIL_DOMAIN, ALIAS_MAILBOX_USER, ALIAS_MAILBOX_PASSWORD) -- exiting");
  process.exit(0);
}

const smtp = nodemailer.createTransport({ host: config.smtpHost, port: 465, secure: true, auth: { user: config.mailboxUser, pass: config.mailboxPassword } });

const deps: AliasMailDeps = {
  async resolve(token, localPart, sender, subject) {
    const rows = await withServiceRoleTransaction((client) =>
      callRpc<{ forward_id: string | null; outcome: string; recipient_email: string | null }>(client, "public.resolve_inbound_email_alias", [token, localPart, sender, subject]),
    );
    const row = rows[0];
    return { forwardId: row?.forward_id ?? null, outcome: row?.outcome ?? "replay", recipientEmail: row?.recipient_email ?? null };
  },
  async complete(forwardId, ok, providerMessageId, error) {
    await withServiceRoleTransaction((client) => client.query("select public.complete_email_alias_forward($1, $2, $3, $4)", [forwardId, ok, providerMessageId, error]));
  },
  async send(mail) {
    try {
      const info = await smtp.sendMail(mail);
      return { ok: true, messageId: info.messageId };
    } catch (error) {
      const failure = classifySmtpFailure(error);
      return { ok: false, permanent: failure.permanent, error: failure.error };
    }
  },
};

async function pollOnce(cfg: AliasMailConfig): Promise<number> {
  const client = new ImapFlow({ host: cfg.imapHost, port: 993, secure: true, auth: { user: cfg.mailboxUser, pass: cfg.mailboxPassword }, logger: false });
  await client.connect();
  let handled = 0;
  try {
    await client.mailboxCreate(PROCESSED).catch(() => undefined); // already exists
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      for (const uid of uids.slice(0, BATCH)) {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!message || !message.source) continue;
        const parsed = await simpleParser(message.source);
        const rawHash = createHash("sha256").update(message.source).digest("hex");
        const outcome = await processAliasMessage(cfg, parsed, rawHash, deps);
        if (outcome === "done") {
          await client.messageMove(String(uid), PROCESSED, { uid: true });
          handled++;
        } else {
          // Reading the body can mark it read; leave it unread so the next poll retries.
          await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return handled;
}

let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

async function main(cfg: AliasMailConfig) {
  console.info(`[alias-mail] polling ${cfg.mailboxUser} on ${cfg.imapHost} every ${pollIntervalMs / 1000}s for *@${cfg.domain}`);
  while (!stopping) {
    try {
      const handled = await pollOnce(cfg);
      if (handled > 0) console.info(`[alias-mail] handled ${handled} message(s)`);
    } catch (error) {
      console.error(`[alias-mail] poll failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

void main(config);
