import { NextResponse, type NextRequest } from "next/server";
import { callRpc, withServiceRoleTransaction } from "@/lib/db/pool";
import { recordError } from "@/lib/error-tracking";
import { readBodyWithin } from "@/lib/read-body";
import { aliasLocalPart, getAliasEmailConfig, sendMailgunForward, verifyMailgunSignature } from "@/lib/mailgun";

/**
 * Mailgun inbound route -> researcher email alias forwarding (db/migrations/202610080001).
 * Session-less on purpose (Mailgun has no session), so proxy.ts excludes this PATH from
 * its session matcher -- a fixed-path exclusion, never a header-based one. The gate is
 * Mailgun's HMAC signature over timestamp + token (lib/mailgun.ts), with a freshness
 * window, and the token is single-use (unique in email_alias_forwards).
 *
 * Status codes are Mailgun's contract: 200 = handled; 406 = refused for good, don't retry
 * (unknown/inactive alias, rate limit, mail looping back from our own domain); 401 = bad
 * signature; 503 = temporary failure, Mailgun retries. Off (404) until configured.
 */

// Mailgun accepts messages up to 25 MB; leave room for the multipart encoding.
const MAX_BODY_BYTES = 30 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const respond = (status: number) => new NextResponse(null, { status });
const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
};

type ResolveRow = { forward_id: string | null; outcome: string; recipient_email: string | null; recipient_display_name: string | null };

export async function POST(request: NextRequest) {
  const config = getAliasEmailConfig();
  if (!config) return respond(404);

  const raw = await readBodyWithin(request, MAX_BODY_BYTES);
  if (raw === null) return respond(413);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(raw), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return respond(400);
  }

  if (!verifyMailgunSignature(config.webhookSigningKey, { timestamp: field(form, "timestamp"), token: field(form, "token"), signature: field(form, "signature") })) {
    return respond(401);
  }

  // ---- Verified: Mailgun delivered this. ----
  const token = field(form, "token")!;
  const sender = field(form, "sender") ?? "";
  const originalFrom = field(form, "from") ?? sender;
  const subject = field(form, "subject") ?? "";
  // Mail from our own alias domain would loop forever; never forward it.
  if (aliasLocalPart(sender, config.domain)) return respond(406);

  const recipient = (field(form, "recipient") ?? "").split(",").map((r) => aliasLocalPart(r, config.domain)).find(Boolean);
  if (!recipient) return respond(406);

  let resolved: ResolveRow | undefined;
  try {
    resolved = (await withServiceRoleTransaction((client) => callRpc<ResolveRow>(client, "public.resolve_inbound_email_alias", [token, recipient, sender, subject])))[0];
  } catch (error) {
    void recordError({ source: "server", message: `email alias resolve failed: ${error instanceof Error ? error.message : String(error)}`, route: "POST /api/inbound/email" });
    return respond(503);
  }
  if (!resolved || resolved.outcome === "replay") return respond(200);
  if (resolved.outcome !== "received" || !resolved.forward_id || !resolved.recipient_email) return respond(406);

  const attachments = form.getAll("attachment").concat([...form.keys()].filter((k) => /^attachment-\d+$/.test(k)).map((k) => form.get(k)!))
    .filter((value): value is File => typeof value !== "string");
  const attachmentBytes = attachments.reduce((sum, file) => sum + file.size, 0);

  const sent = await sendMailgunForward(config, {
    to: resolved.recipient_email,
    aliasAddress: `${recipient}@${config.domain}`,
    originalFrom,
    subject,
    text: field(form, "body-plain"),
    html: field(form, "body-html"),
    attachments: attachmentBytes <= MAX_ATTACHMENT_BYTES ? attachments : [],
  });

  try {
    await withServiceRoleTransaction((client) =>
      client.query("select public.complete_email_alias_forward($1, $2, $3, $4)", [resolved!.forward_id, sent.ok, sent.ok ? sent.id : null, sent.ok ? null : sent.error]),
    );
  } catch (error) {
    void recordError({ source: "server", message: `email alias completion not recorded: ${error instanceof Error ? error.message : String(error)}`, route: "POST /api/inbound/email" });
  }
  if (sent.ok) return respond(200);
  void recordError({ source: "server", message: `email alias forward failed: ${sent.error}`, route: "POST /api/inbound/email" });
  // 503 makes Mailgun retry with the same token; the row is 'failed', which
  // resolve_inbound_email_alias treats as retryable rather than a replay (202610080002).
  return respond(sent.retryable ? 503 : 406);
}
