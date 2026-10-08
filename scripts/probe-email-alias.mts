// End-to-end probe for researcher email aliases (db/migrations/202610080001/2): signed
// Mailgun-style deliveries POSTed to the real /api/inbound/email route, a local stand-in
// for Mailgun's send API that records what the app forwards, and the forwarding log.
//
// Start the app with the alias settings pointed at the stand-in, then run this:
//   ALIAS_EMAIL_DOMAIN=alias.netras.test MAILGUN_API_KEY=probe-key \
//   MAILGUN_WEBHOOK_SIGNING_KEY=probe-signing-key MAILGUN_API_BASE=http://127.0.0.1:4799  (app env)
//   npx tsx --env-file=.env.local scripts/probe-email-alias.mts [baseUrl=http://127.0.0.1:3100]
// Creates the e2e.veteran alias (idempotent); forwarding-log rows it writes are test data.
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import pg from "pg";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const DOMAIN = "alias.netras.test";
const SIGNING_KEY = "probe-signing-key";
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ""}`);
};

// ---- Stand-in for Mailgun's messages API ----
type Sent = { url: string; auth: string; fields: Record<string, string> };
const sent: Sent[] = [];
let nextStatus = 200;
const mailgun = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const form = await new Response(Buffer.concat(chunks), { headers: { "content-type": req.headers["content-type"] ?? "" } }).formData();
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) fields[k] = typeof v === "string" ? v : `file:${v.name}`;
  sent.push({ url: req.url ?? "", auth: req.headers.authorization ?? "", fields });
  res.writeHead(nextStatus, { "content-type": "application/json" });
  res.end(nextStatus === 200 ? JSON.stringify({ id: `<probe-${sent.length}@mailgun>` }) : "{}");
});
await new Promise<void>((resolve) => mailgun.listen(4799, "127.0.0.1", resolve));

function delivery(over: Partial<Record<string, string>> & { recipient: string }, opts: { token?: string; key?: string; timestamp?: number } = {}) {
  const token = opts.token ?? randomBytes(25).toString("hex");
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const form = new FormData();
  const fields = { sender: "bounces@shop.example", from: "Shop <noreply@shop.example>", subject: "Verify your account", "body-plain": "Your code is 4242", ...over };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) form.append(k, v);
  form.append("timestamp", timestamp);
  form.append("token", token);
  form.append("signature", createHmac("sha256", opts.key ?? SIGNING_KEY).update(timestamp + token).digest("hex"));
  return { token, post: () => fetch(`${BASE}/api/inbound/email`, { method: "POST", body: form }) };
}

const pool = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const db = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;
try {
  const vet = (await db("select id, email, username from public.users where email = 'e2e.veteran@unpatched.demo'"))[0];
  // Create the alias exactly as the settings button does (ensure_my_email_alias as the user).
  const client = await pool.connect();
  await client.query("begin");
  await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: vet.id, role: "authenticated" })]);
  await client.query("set local role authenticated");
  const local = (await client.query("select public.ensure_my_email_alias() a")).rows[0].a as string;
  await client.query("commit");
  client.release();
  check("a researcher gets an alias from their username", local === vet.username.toLowerCase(), { local, username: vet.username });
  const org = (await db("select u.id from public.users u where u.email = 'e2e.admin@unpatched.demo'"))[0];

  // Happy path.
  const ok = delivery({ recipient: `${local}@${DOMAIN}` });
  const okRes = await ok.post();
  check("a signed delivery to the alias is accepted (200)", okRes.status === 200, okRes.status);
  const msg = sent.at(-1);
  check("it is forwarded to the researcher's real email", msg?.fields.to === vet.email, msg?.fields);
  check("from the alias domain, with the original sender in the name", msg?.fields.from === `"Shop  noreply@shop.example via Netras" <forwarder@${DOMAIN}>`, msg?.fields.from);
  check("replies go to the original sender", msg?.fields["h:Reply-To"] === "Shop <noreply@shop.example>");
  check("the subject and body are passed through", msg?.fields.subject === "Verify your account" && msg?.fields.text === "Your code is 4242");
  check("the app authenticates to Mailgun with its API key", msg?.auth === `Basic ${Buffer.from("api:probe-key").toString("base64")}` && msg?.url === `/v3/${DOMAIN}/messages`);
  const okRow = (await db("select status, provider_message_id from public.email_alias_forwards where provider_token = $1", [ok.token]))[0];
  check("the forwarding log records it as forwarded", okRow?.status === "forwarded" && okRow.provider_message_id?.startsWith("<probe-"), okRow);

  // Replay and forgery.
  const before = sent.length;
  check("replaying the same delivery is acknowledged but not re-sent", (await ok.post()).status === 200 && sent.length === before);
  check("a wrong signature is refused (401)", (await delivery({ recipient: `${local}@${DOMAIN}` }, { key: "attacker-key" }).post()).status === 401);
  check("a day-old signed request is refused (401)", (await delivery({ recipient: `${local}@${DOMAIN}` }, { timestamp: Math.floor(Date.now() / 1000) - 2 * 86400 }).post()).status === 401);
  check("nothing was forwarded for any of those", sent.length === before);

  // Refusals Mailgun must not retry.
  const unknown = delivery({ recipient: `nobody_here_${Date.now()}@${DOMAIN}` });
  check("an unknown alias is refused for good (406)", (await unknown.post()).status === 406);
  check("and logged without an owner", (await db("select status, user_id from public.email_alias_forwards where provider_token = $1", [unknown.token]))[0]?.status === "rejected_unknown_alias");
  check("mail from our own alias domain is never forwarded (loop guard, 406)", (await delivery({ recipient: `${local}@${DOMAIN}`, sender: `${local}@${DOMAIN}` }).post()).status === 406);
  check("a different domain is not ours to forward (406)", (await delivery({ recipient: `${local}@other.example` }).post()).status === 406);
  void org;

  // Temporary Mailgun failure, then Mailgun's retry with the same token.
  nextStatus = 503;
  const retry = delivery({ recipient: `${local}@${DOMAIN}`, subject: "Retry me" });
  check("a temporary send failure asks Mailgun to retry (503)", (await retry.post()).status === 503);
  check("and is logged as failed", (await db("select status from public.email_alias_forwards where provider_token = $1", [retry.token]))[0]?.status === "failed");
  nextStatus = 200;
  check("Mailgun's retry with the same token is forwarded (not treated as a replay)", (await retry.post()).status === 200 && sent.at(-1)?.fields.subject === "Retry me");
  check("and the log row is now forwarded", (await db("select status from public.email_alias_forwards where provider_token = $1", [retry.token]))[0]?.status === "forwarded");

  // Inactive accounts.
  await db("update public.users set is_suspended = true where id = $1", [vet.id]);
  try {
    const n = sent.length;
    check("a suspended researcher's alias stops forwarding (406)", (await delivery({ recipient: `${local}@${DOMAIN}` }).post()).status === 406 && sent.length === n);
  } finally {
    await db("update public.users set is_suspended = false where id = $1", [vet.id]);
  }

  // Organization accounts get no alias.
  const orgClient = await pool.connect();
  await orgClient.query("begin");
  await orgClient.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: org.id, role: "authenticated" })]);
  await orgClient.query("set local role authenticated");
  let orgError = "";
  try {
    await orgClient.query("select public.ensure_my_email_alias()");
  } catch (error) {
    orgError = error instanceof Error ? error.message : String(error);
  }
  await orgClient.query("rollback");
  orgClient.release();
  check("an organization account cannot get an alias", orgError.startsWith("FORBIDDEN"), orgError);
} finally {
  mailgun.close();
  await pool.end();
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
