// DB probe for researcher email aliases on Hostinger (decision 0086): runs the worker's
// real message handling (lib/alias-mail.ts) against the real RPCs, with a stub in place of
// Hostinger SMTP. Everything happens in one transaction that is ROLLED BACK -- no writes.
//   npx tsx --env-file=.env.local scripts/probe-email-alias.mts
import pg from "pg";
import { simpleParser } from "mailparser";
import { processAliasMessage, type AliasMailDeps, type OutgoingMail } from "../lib/alias-mail";

const config = { domain: "alias.netras.test", mailboxUser: "forwarder@alias.netras.test", mailboxPassword: "x", imapHost: "-", smtpHost: "-", brandName: "Netras" };
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ""}`);
};

const pool = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const client = await pool.connect();
const as = async (sub: string, role: string) => {
  await client.query("reset role");
  await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub, role })]);
  await client.query(`set local role ${role}`);
};
const sent: OutgoingMail[] = [];
let smtp: "ok" | "temporary" = "ok";
const deps: AliasMailDeps = {
  async resolve(token, local, sender, subject) {
    const row = (await client.query("select * from public.resolve_inbound_email_alias($1, $2, $3, $4)", [token, local, sender, subject])).rows[0];
    return { forwardId: row?.forward_id ?? null, outcome: row?.outcome ?? "replay", recipientEmail: row?.recipient_email ?? null };
  },
  async complete(id, ok, msgId, error) {
    await client.query("select public.complete_email_alias_forward($1, $2, $3, $4)", [id, ok, msgId, error]);
  },
  async send(mail) {
    if (smtp === "temporary") return { ok: false, permanent: false, error: "retryable (SMTP 451)" };
    sent.push(mail);
    return { ok: true, messageId: `<probe-${sent.length}@hostinger>` };
  },
};
const message = (id: string, to: string, from = "Shop <noreply@shop.example>") =>
  simpleParser(`From: ${from}\r\nTo: ${to}\r\nDelivered-To: forwarder@${config.domain}\r\nMessage-ID: <${id}@shop.example>\r\nSubject: Verify your account\r\n\r\nYour code is 4242\r\n`);
const log = async (token: string) => (await client.query("select status, provider_message_id from public.email_alias_forwards where provider_token = $1", [token])).rows[0];

try {
  await client.query("begin");
  const vet = (await client.query("select id, email, username from public.users where email = 'e2e.veteran@unpatched.demo'")).rows[0];
  const admin = (await client.query("select id from public.users where email = 'e2e.admin@unpatched.demo'")).rows[0];

  await as(vet.id, "authenticated");
  const local = (await client.query("select public.ensure_my_email_alias() a")).rows[0].a as string;
  check("a researcher gets an alias from their username", local === vet.username.toLowerCase(), { local });
  await as(admin.id, "authenticated");
  const orgTry = await client.query("savepoint s; select public.ensure_my_email_alias()").then(() => "allowed", async () => (await client.query("rollback to savepoint s"), "refused"));
  check("an organization account cannot get an alias", orgTry === "refused");

  await as("", "service_role");
  const first = await message("p1", `${local}+shop@${config.domain}`);
  check("a message to the alias is filed as done", (await processAliasMessage(config, first, "h1", deps)) === "done");
  check("it is forwarded to the researcher's real email, from the mailbox", sent.at(-1)?.to === vet.email && sent.at(-1)!.from.endsWith(`<${config.mailboxUser}>`), sent.at(-1));
  check("the log records it as forwarded", (await log(`<p1@shop.example>|${local}`))?.status === "forwarded");

  await processAliasMessage(config, first, "h1", deps);
  check("re-polling the same message never forwards it twice", sent.length === 1);

  smtp = "temporary";
  const second = await message("p2", `${local}@${config.domain}`);
  check("a temporary SMTP failure leaves the message for the next poll", (await processAliasMessage(config, second, "h2", deps)) === "retry");
  check("logged as failed meanwhile", (await log(`<p2@shop.example>|${local}`))?.status === "failed");
  smtp = "ok";
  check("the next poll forwards it on the same row", (await processAliasMessage(config, second, "h2", deps)) === "done" && (await log(`<p2@shop.example>|${local}`))?.status === "forwarded");

  const ghost = await message("p3", `nobody_here_zz@${config.domain}`);
  await processAliasMessage(config, ghost, "h3", deps);
  check("an unknown alias is logged as refused and not forwarded", (await log("<p3@shop.example>|nobody_here_zz"))?.status === "rejected_unknown_alias" && sent.length === 2);

  const loop = await message("p4", `${local}@${config.domain}`, `someone@${config.domain}`);
  await processAliasMessage(config, loop, "h4", deps);
  check("mail from the alias domain itself is never forwarded", sent.length === 2 && !(await log(`<p4@shop.example>|${local}`)));
} finally {
  await client.query("rollback");
  client.release();
  await pool.end();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
