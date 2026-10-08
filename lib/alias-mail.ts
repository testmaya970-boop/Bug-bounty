import type { ParsedMail } from "mailparser";

/**
 * Researcher email aliases on Hostinger Email (db/migrations/202610080001/2, decision 0086).
 * Hostinger has no inbound webhook, so a catch-all mailbox on the alias domain collects
 * every alias's mail; workers/alias-mail polls it over IMAP and forwards each message to
 * the researcher's real address over Hostinger SMTP, from that same mailbox. Configured
 * entirely by env; the feature is off until all of it is set.
 */
export type AliasMailConfig = {
  /** The alias domain, e.g. alias.netras.ai (a domain on your Hostinger Email plan). */
  domain: string;
  /** The catch-all mailbox's login, e.g. forwarder@alias.netras.ai. Also the From address. */
  mailboxUser: string;
  mailboxPassword: string;
  imapHost: string;
  smtpHost: string;
  /** Shown in the forwarded copy's From name, e.g. "noreply@shop.com via Netras". */
  brandName: string;
};

export function getAliasMailConfig(env: NodeJS.ProcessEnv = process.env): AliasMailConfig | null {
  const domain = env.ALIAS_EMAIL_DOMAIN?.trim().toLowerCase();
  const mailboxUser = env.ALIAS_MAILBOX_USER?.trim();
  const mailboxPassword = env.ALIAS_MAILBOX_PASSWORD;
  if (!domain || !mailboxUser || !mailboxPassword) return null;
  return {
    domain,
    mailboxUser,
    mailboxPassword,
    imapHost: env.ALIAS_IMAP_HOST?.trim() || "imap.hostinger.com",
    smtpHost: env.ALIAS_SMTP_HOST?.trim() || "smtp.hostinger.com",
    brandName: env.ALIAS_EMAIL_BRAND?.trim() || "Netras",
  };
}

/** "alice@alias.netras.ai" -> "alice" when the domain is the alias domain, else null.
 * Plus-addressing is accepted and ignored (alice+shopify@ -> alice). */
export function aliasLocalPart(address: string, aliasDomain: string): string | null {
  const match = /^\s*<?([^@<>\s,;"]+)@([^@<>\s,;"]+?)>?\s*$/.exec(address);
  if (!match || match[2].toLowerCase() !== aliasDomain) return null;
  const local = match[1].toLowerCase().split("+")[0];
  return /^[a-z0-9_]{3,40}$/.test(local) ? local : null;
}

// Where the real envelope recipient can show up: catch-all delivery usually stamps
// Delivered-To / X-Original-To / Envelope-To; To and Cc cover the rest. Bcc never appears.
const RECIPIENT_HEADERS = new Set(["delivered-to", "x-original-to", "envelope-to", "x-envelope-to", "to", "cc"]);
const MAILBOX_LOCAL_PARTS = new Set(["forwarder", "postmaster", "abuse"]);

/** Every distinct alias on our domain this message was addressed to. */
export function aliasRecipients(headerLines: ParsedMail["headerLines"], config: Pick<AliasMailConfig, "domain" | "mailboxUser">): string[] {
  const own = config.mailboxUser.toLowerCase().split("@")[0];
  const found = new Set<string>();
  for (const { key, line } of headerLines) {
    if (!RECIPIENT_HEADERS.has(key.toLowerCase())) continue;
    for (const address of line.slice(line.indexOf(":") + 1).match(/[^\s<>,;:"]+@[^\s<>,;:"]+/g) ?? []) {
      const local = aliasLocalPart(address, config.domain);
      if (local && local !== own && !MAILBOX_LOCAL_PARTS.has(local)) found.add(local);
    }
  }
  return [...found];
}

export type OutgoingMail = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text?: string;
  html?: string;
  attachments: { filename?: string; content: Buffer; contentType?: string }[];
  headers: Record<string, string>;
};

/** The forwarded copy. From is the alias mailbox (so SPF/DKIM pass for the domain); the
 * original sender is in the display name and Reply-To, so replying still reaches them. */
export function buildForward(config: AliasMailConfig, parsed: ParsedMail, recipientEmail: string, localPart: string): OutgoingMail {
  const original = parsed.from?.text?.trim() || "unknown sender";
  const label = original.replace(/[\r\n"<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    from: `"${label} via ${config.brandName}" <${config.mailboxUser}>`,
    to: recipientEmail,
    replyTo: original,
    subject: parsed.subject || "(no subject)",
    text: parsed.text || (parsed.html ? undefined : "(empty message)"),
    html: typeof parsed.html === "string" ? parsed.html : undefined,
    attachments: parsed.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    headers: { "X-Forwarded-For-Alias": `${localPart}@${config.domain}` },
  };
}

export type ResolveResult = { forwardId: string | null; outcome: string; recipientEmail: string | null };
export type AliasMailDeps = {
  resolve: (token: string, localPart: string, sender: string, subject: string) => Promise<ResolveResult>;
  complete: (forwardId: string, ok: boolean, providerMessageId: string | null, error: string | null) => Promise<void>;
  send: (mail: OutgoingMail) => Promise<{ ok: true; messageId: string } | { ok: false; permanent: boolean; error: string }>;
};

/**
 * One mailbox message. Returns "done" (file it away: forwarded, refused, or not ours) or
 * "retry" (leave it unread; the next poll tries again -- a temporary SMTP failure). The
 * token is Message-ID + alias, so a re-polled message is never forwarded twice, while one
 * whose forward failed is retried on the same log row (202610080002).
 */
export async function processAliasMessage(config: AliasMailConfig, parsed: ParsedMail, rawHash: string, deps: AliasMailDeps): Promise<"done" | "retry"> {
  const sender = parsed.from?.value?.[0]?.address ?? "";
  // Mail from our own alias domain would loop forever; never forward it.
  if (aliasLocalPart(sender, config.domain)) return "done";

  let retry = false;
  for (const local of aliasRecipients(parsed.headerLines, config)) {
    const token = `${parsed.messageId ?? `sha256:${rawHash}`}|${local}`.slice(0, 500);
    const resolved = await deps.resolve(token, local, sender, parsed.subject ?? "");
    if (resolved.outcome !== "received" || !resolved.forwardId || !resolved.recipientEmail) continue;

    const result = await deps.send(buildForward(config, parsed, resolved.recipientEmail, local));
    await deps.complete(resolved.forwardId, result.ok, result.ok ? result.messageId : null, result.ok ? null : result.error);
    if (!result.ok && !result.permanent) retry = true;
  }
  return retry ? "retry" : "done";
}
