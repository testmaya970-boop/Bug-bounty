// Live workflow probe for the payout lifecycle (db/migrations/202610060008). Drives the real
// RPCs as the real roles (authenticated / service_role, with actor claims) against the local
// database, inside ONE transaction that is always rolled back -- nothing persists.
//
//   npx tsx --env-file=.env.local scripts/probe-payout-lifecycle.mts
//
// Needs the deterministic E2E seed (npm run seed:e2e): the e2e org's resolved, finalized report.
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
let failures = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ""}`);
}

async function as(role: "authenticated" | "service_role", userId: string | null) {
  await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: userId ?? "", role })]);
  await client.query(`set local role ${role}`);
}

/** Runs `sql` as `userId`; returns rows, or the error's CODE prefix (savepoint keeps the tx alive). */
async function run(userId: string | null, sql: string, params: unknown[] = [], role: "authenticated" | "service_role" = "authenticated") {
  await client.query("savepoint s");
  try {
    await as(role, userId);
    const { rows } = await client.query(sql, params);
    await client.query("release savepoint s");
    return { rows, code: null as string | null };
  } catch (error) {
    await client.query("rollback to savepoint s");
    const message = error instanceof Error ? error.message : String(error);
    return { rows: [] as pg.QueryResultRow[], code: /^([A-Z_]+):/.exec(message)?.[1] ?? message };
  }
}

const userId = async (email: string) => (await run(null, "select id from public.users where email = $1", [email], "service_role")).rows[0]?.id as string;

await client.query("begin");
try {
  const S = await userId("e2e.veteran@unpatched.demo"); // submitter
  const C = await userId("e2e.hunter@unpatched.demo"); // collaborator
  const X = await userId("e2e.newcomer@unpatched.demo"); // unrelated researcher
  const O = await userId("e2e.admin@unpatched.demo"); // org owner
  const B = await userId("e2e.billing-admin@unpatched.demo"); // billing admin
  const T = await userId("e2e.triager@unpatched.demo"); // triager
  const A = await userId("e2e.platform-admin@unpatched.demo");
  const report = (
    await run(
      null,
      `select r.id, r.organization_id, d.final_amount_minor_units::bigint amount from public.reports r join public.report_bounty_decisions d on d.report_id = r.id
        where r.researcher_id = $1 and r.status = 'resolved' and d.state = 'finalized' and d.final_amount_minor_units > 0 limit 1`,
      [S],
      "service_role",
    )
  ).rows[0];
  if (!report) throw new Error("no seeded resolved+finalized report for e2e.veteran -- run npm run seed:e2e");
  const R = report.id as string;
  const amount = Number(report.amount);

  // Clean slate for this report (rolled back): no live obligations, a 25% collaborator, admin.
  await run(null, "update public.payment_obligations set status = 'cancelled' where report_id = $1 and status <> 'cancelled'", [R], "service_role");
  await run(null, "delete from public.report_collaborators where report_id = $1", [R], "service_role");
  await run(null, "delete from public.bounty_acceptances where report_id = $1", [R], "service_role");
  await run(null, "insert into public.report_collaborators (report_id, researcher_id, bounty_split_percent, added_by) values ($1, $2, 25, $3)", [R, C, S], "service_role");
  await run(null, "delete from public.researcher_payout_details where user_id in ($1, $2)", [S, C], "service_role");
  await run(null, "insert into public.platform_admins (user_id) values ($1) on conflict do nothing", [A], "service_role");

  // Researcher confirms the award.
  check("submitter can confirm the award", (await run(S, "select * from public.accept_bounty($1)", [R])).rows.length === 1);
  // Reads go through RLS as the signed-in role (a policy calling a non-executable helper
  // once crashed the report page while every RPC check here passed).
  const acceptanceRows = async (who: string) => (await run(who, "select count(*)::int n from public.bounty_acceptances where report_id = $1", [R]));
  check("the submitter can read their confirmation", (await acceptanceRows(S)).rows[0]?.n === 1, (await acceptanceRows(S)).code);
  check("the org owner can read it", (await acceptanceRows(O)).rows[0]?.n === 1, (await acceptanceRows(O)).code);
  check("an unrelated researcher reads nothing (no error)", (await acceptanceRows(X)).rows[0]?.n === 0, (await acceptanceRows(X)).code);
  check("a collaborator cannot confirm it", (await run(C, "select * from public.accept_bounty($1)", [R])).code === "FORBIDDEN");
  check("confirmation is audited", (await run(null, "select 1 from public.audit_logs where entity_id = $1 and action = 'bounty.accepted' and created_at >= now()", [R], "service_role")).rows.length === 1);

  // Who can create obligations.
  check("submitter cannot create their own obligation (self-dealing)", (await run(S, "select * from public.create_payment_obligation($1)", [R])).code === "FORBIDDEN");
  check("unrelated researcher cannot create one", (await run(X, "select * from public.create_payment_obligation($1)", [R])).code === "FORBIDDEN");
  check("triager cannot create one", (await run(T, "select * from public.create_payment_obligation($1)", [R])).code === "FORBIDDEN");

  // Split obligations.
  const created = await run(O, "select * from public.create_payment_obligation($1)", [R]);
  const share = Math.floor((amount * 25) / 100);
  const byRecipient = new Map(created.rows.map((o) => [o.researcher_id, o]));
  check("owner creates one obligation per recipient", created.rows.length === 2, created);
  check(`collaborator owed 25% (${share})`, Number(byRecipient.get(C)?.amount_minor_units) === share);
  check(`submitter owed the remainder (${amount - share})`, Number(byRecipient.get(S)?.amount_minor_units) === amount - share);
  check("each fee is 20% of its share", created.rows.every((o) => Number(o.platform_fee_minor_units) === Math.floor((Number(o.amount_minor_units) * 2000) / 10000)));
  check("creating twice is refused", (await run(O, "select * from public.create_payment_obligation($1)", [R])).code === "OBLIGATION_ALREADY_EXISTS");
  const enqueued = (await run(null, "select payload from public.outbox_events where aggregate_id = $1 and event_type = 'payment.obligation_created' order by created_at desc limit 2", [R], "service_role")).rows;
  check("a payment_scheduled event is enqueued per recipient", new Set(enqueued.map((e) => e.payload.recipient_id)).size === 2 && enqueued.every((e) => [S, C].includes(e.payload.recipient_id)));

  // Readiness visibility.
  const ownerView = (await run(O, "select * from public.get_report_payout_readiness($1)", [R])).rows;
  check("finance sees both recipients' blockers", ownerView.length === 2 && ownerView.every((r) => r.blockers.includes("payout_method_missing") && r.blockers.includes("tax_form_not_verified")));
  const collabView = (await run(C, "select * from public.get_report_payout_readiness($1)", [R])).rows;
  check("a collaborator sees only their own row", collabView.length === 1 && collabView[0].researcher_id === C);
  check("an unrelated researcher sees nothing", (await run(X, "select * from public.get_report_payout_readiness($1)", [R])).rows.length === 0);
  check("a triager (not finance) sees nothing", (await run(T, "select * from public.get_report_payout_readiness($1)", [R])).rows.length === 0);

  // Payout gate.
  const sObligation = byRecipient.get(S)!.id;
  const cObligation = byRecipient.get(C)!.id;
  check("payout refused without method and verified tax form", (await run(O, "select * from public.initiate_manual_payment_attempt($1)", [sObligation])).code === "PAYOUT_NOT_READY");
  await run(S, "select public.upsert_my_payout_details('paypal', null, null, null, 'veteran.payouts@example.test')");
  await run(S, "select public.upsert_my_tax_form('w9', '123-45-6789')");
  const pending = (await run(O, "select * from public.get_report_payout_readiness($1)", [R])).rows.find((r) => r.researcher_id === S);
  check("after submitting, only tax verification is missing", JSON.stringify(pending?.blockers) === JSON.stringify(["tax_form_not_verified"]), pending);
  check("a researcher cannot verify their own tax form", (await run(S, "select public.review_tax_form($1, 'verified')", [S])).code === "FORBIDDEN");
  check("an org owner cannot verify tax forms", (await run(O, "select public.review_tax_form($1, 'verified')", [S])).code === "FORBIDDEN");
  check("platform admin sees it in the queue", (await run(A, "select * from public.list_pending_tax_forms()")).rows.some((r) => r.user_id === S));
  check("platform admin verifies the tax form", (await run(A, "select public.review_tax_form($1, 'verified', 'W-9 checked')", [S])).code === null);
  check("tax review is audited", (await run(null, "select 1 from public.audit_logs where entity_id = $1 and action = 'payout.tax_form_reviewed' and created_at >= now()", [S], "service_role")).rows.length === 1);

  // Pay the submitter (billing admin), record success.
  const attempt = await run(B, "select * from public.initiate_manual_payment_attempt($1)", [sObligation]);
  check("billing admin starts the payout once the submitter is ready", attempt.rows.length === 1, attempt.code);
  check(
    "recording success marks the obligation paid",
    (await run(B, "select * from public.record_manual_payment_result($1, 'succeeded', 'WIRE-778', '', '')", [attempt.rows[0]?.id])).code === null &&
      (await run(null, "select status from public.payment_obligations where id = $1", [sObligation], "service_role")).rows[0]?.status === "succeeded",
  );
  const paidEvent = (await run(null, "select id, payload from public.outbox_events where aggregate_id = $1 and event_type = 'payment.succeeded' order by created_at desc limit 1", [R], "service_role")).rows[0];
  check("payment.succeeded is enqueued for the submitter", paidEvent?.payload.recipient_id === S);
  const notified = await run(null, "select recipient_id, category, notification_type from public.route_payment_notifications($1, 'payment_succeeded')", [paidEvent?.id], "service_role");
  check("routing it notifies exactly the submitter (bounty_activity)", notified.rows.length === 1 && notified.rows[0].recipient_id === S && notified.rows[0].category === "bounty_activity", notified);
  check("a mismatched notification type is refused (provenance)", (await run(null, "select * from public.route_payment_notifications($1, 'payment_failed')", [paidEvent?.id], "service_role")).code === "PROVENANCE_MISMATCH");
  check("the router is not callable by a signed-in user", (await run(S, "select * from public.route_payment_notifications($1, 'payment_succeeded')", [paidEvent?.id])).code !== null);

  // Dispute pauses payment.
  check("submitter opens a bounty dispute", (await run(S, "select * from public.open_report_mediation($1, 'disagree_with_bounty', 'The award ignores the auth bypass chain.')", [R])).code === null);
  check("an open dispute blocks starting a payout", (await run(O, "select * from public.initiate_manual_payment_attempt($1)", [cObligation])).code === "BOUNTY_DISPUTED");
  check("and blocks re-confirming the award", (await run(S, "select * from public.accept_bounty($1)", [R])).code === "BOUNTY_DISPUTED");
  const mediationEvent = (await run(null, "select id from public.outbox_events where aggregate_id = $1 and event_type = 'report.mediation_opened' order by created_at desc limit 1", [R], "service_role")).rows[0];
  const orgNotified = await run(null, "select recipient_id from public.route_payment_notifications($1, 'report_mediation_opened')", [mediationEvent?.id], "service_role");
  check("the mediation request notifies the organization, not the researcher", orgNotified.rows.length > 0 && orgNotified.rows.some((r) => r.recipient_id === O) && !orgNotified.rows.some((r) => r.recipient_id === S));

  // Cancel and recover.
  check("owner cancels the collaborator's obligation", (await run(O, "select * from public.cancel_payment_obligation($1, 'Collaborator share renegotiated')", [cObligation])).code === null);
  const cancelEvent = (await run(null, "select payload from public.outbox_events where aggregate_id = $1 and event_type = 'payment.cancelled' order by created_at desc limit 1", [R], "service_role")).rows[0];
  check("payment.cancelled is enqueued for the collaborator", cancelEvent?.payload.recipient_id === C);
  check("re-issuing while a paid obligation is live is refused", (await run(O, "select * from public.create_payment_obligation($1)", [R])).code === "OBLIGATION_ALREADY_EXISTS");
  await run(null, "update public.payment_obligations set status = 'cancelled' where report_id = $1", [R], "service_role");
  await run(null, "update public.report_mediations set status = 'resolved', resolved_at = now() where report_id = $1 and status = 'open'", [R], "service_role");
  check("once every obligation is cancelled, the award can be re-issued", (await run(O, "select * from public.create_payment_obligation($1)", [R])).rows.length === 2);

  // Integrity.
  check(
    "an obligation for someone who is neither submitter nor collaborator is refused",
    (await run(null, `insert into public.payment_obligations (organization_id, program_id, report_id, researcher_id, bounty_decision_id, amount_minor_units, platform_fee_minor_units, currency, status)
       select organization_id, program_id, report_id, $2, bounty_decision_id, 100, 20, currency, 'cancelled' from public.payment_obligations where report_id = $1 limit 1`, [R, X], "service_role")).code === "INVALID_RECIPIENT",
  );

  // Accounting.
  const summary = (await run(O, "select * from public.get_organization_bounty_spend_summary($1)", [report.organization_id])).rows.find((r) => r.currency === "USD");
  check("spend summary separates awarded, paid and outstanding", summary && Number(summary.total_awarded_minor_units) >= amount && Number(summary.total_paid_minor_units) >= 0 && Number(summary.total_outstanding_minor_units) >= amount, summary);
  check("a researcher cannot read org spend analytics", (await run(S, "select * from public.get_organization_bounty_spend_summary($1)", [report.organization_id])).code !== null);
} finally {
  await client.query("rollback");
  client.release();
  await pool.end();
}

console.log(failures === 0 ? "\nALL PASS (rolled back)" : `\n${failures} FAILED (rolled back)`);
process.exit(failures === 0 ? 0 : 1);
