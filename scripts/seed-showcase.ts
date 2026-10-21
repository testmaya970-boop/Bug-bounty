#!/usr/bin/env tsx
// Development showcase data: organizations billed from many countries, each with a real paid
// award and a real fee invoice, so Payments, invoices and tax handling can be seen working for
// customers everywhere -- not only one US test org. The country mix follows the markets
// HackerOne and Bugcrowd serve, and deliberately covers every invoice tax path:
//   * foreign company paying USD          -> export of services, zero-rated
//   * Indian company, seller's state, INR -> CGST 9% + SGST 9%
//   * Indian company, other state, INR    -> IGST 18%
//   * Indian company paying USD           -> IGST 18% (place of supply is India; 202610200001)
//
// Same conventions as seed-e2e.ts: every business step goes through the RPCs the app calls
// (create_organization, upsert_billing_profile, submit_report, finalize_bounty,
// create_payment_obligation, record_manual_payment_result, issue_invoices_for_period...).
// Idempotent: each organization is skipped once it has a paid award. All companies are
// fictional. The hunter is its own researcher (showcase.hunter), never an E2E account: the
// release-gate specs read the E2E researchers' report lists, and 21 extra reports pushed theirs
// off the first page. Needs the E2E platform admin, so run `npm run seed:e2e` first.
//
// Usage: ALLOW_TEST_ACCOUNTS=1 npm run seed:showcase

import { Pool, type PoolClient } from "pg";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";

if (process.env.ALLOW_TEST_ACCOUNTS !== "1") {
  console.error("Refusing to seed: this creates accounts with a password published in the repo. Set ALLOW_TEST_ACCOUNTS=1 for a local database only.");
  process.exit(1);
}
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required (npm run seed:showcase loads .env.local).");
  process.exit(1);
}

const PASSWORD = "E2ESeed!2026";
const HUNTER_EMAIL = "showcase.hunter@unpatched.demo";
const ADMIN_EMAIL = "e2e.platform-admin@unpatched.demo";
const SELLER = { name: "Unpatched SANDBOX (not a tax invoice)", gstin: null, address: "Bengaluru, Karnataka, India", state_code: "29" };

type Company = { slug: string; name: string; legal: string; country: string; city: string; postal: string; address: string; currency: "USD" | "INR"; state?: string; gstin?: string };

const COMPANIES: Company[] = [
  { slug: "us", name: "Northwind Payments", legal: "Northwind Payments, Inc.", country: "US", city: "San Francisco", postal: "94105", address: "600 Market Street, Suite 400", currency: "USD" },
  { slug: "gb", name: "Albion Health", legal: "Albion Health Ltd", country: "GB", city: "London", postal: "EC2A 4NE", address: "12 Worship Street", currency: "USD" },
  { slug: "de", name: "Rheinwerk Mobility", legal: "Rheinwerk Mobility GmbH", country: "DE", city: "Berlin", postal: "10115", address: "Invalidenstraße 117", currency: "USD" },
  { slug: "fr", name: "Lumière Retail", legal: "Lumière Retail SAS", country: "FR", city: "Paris", postal: "75002", address: "18 Rue du Sentier", currency: "USD" },
  { slug: "nl", name: "Polder Cloud", legal: "Polder Cloud B.V.", country: "NL", city: "Amsterdam", postal: "1012 AB", address: "Damrak 70", currency: "USD" },
  { slug: "ie", name: "Liffey Fintech", legal: "Liffey Fintech Ltd", country: "IE", city: "Dublin", postal: "D02 X285", address: "4 Grand Canal Square", currency: "USD" },
  { slug: "se", name: "Nordljus Energy", legal: "Nordljus Energy AB", country: "SE", city: "Stockholm", postal: "111 57", address: "Kungsgatan 33", currency: "USD" },
  { slug: "ch", name: "Alpenbank Digital", legal: "Alpenbank Digital AG", country: "CH", city: "Zürich", postal: "8001", address: "Bahnhofstrasse 45", currency: "USD" },
  { slug: "es", name: "Iberia Logistics", legal: "Iberia Logistics S.L.", country: "ES", city: "Madrid", postal: "28013", address: "Gran Vía 28", currency: "USD" },
  { slug: "ca", name: "Maple Ledger", legal: "Maple Ledger Inc.", country: "CA", city: "Toronto", postal: "M5H 2N2", address: "100 King Street West", currency: "USD" },
  { slug: "au", name: "Coral Coast Telecom", legal: "Coral Coast Telecom Pty Ltd", country: "AU", city: "Sydney", postal: "2000", address: "1 Martin Place", currency: "USD" },
  { slug: "sg", name: "Merlion Commerce", legal: "Merlion Commerce Pte Ltd", country: "SG", city: "Singapore", postal: "018989", address: "10 Marina Boulevard", currency: "USD" },
  { slug: "jp", name: "Sakura Games", legal: "Sakura Games K.K.", country: "JP", city: "Tokyo", postal: "100-0005", address: "1-1 Marunouchi, Chiyoda-ku", currency: "USD" },
  { slug: "kr", name: "Hangang Mobile", legal: "Hangang Mobile Co., Ltd.", country: "KR", city: "Seoul", postal: "04524", address: "30 Eulji-ro, Jung-gu", currency: "USD" },
  { slug: "il", name: "Negev Security", legal: "Negev Security Ltd", country: "IL", city: "Tel Aviv", postal: "6688101", address: "23 Menachem Begin Road", currency: "USD" },
  { slug: "ae", name: "Dune Exchange", legal: "Dune Exchange FZ-LLC", country: "AE", city: "Dubai", postal: "00000", address: "Building 5, Dubai Internet City", currency: "USD" },
  { slug: "br", name: "Ipanema Pagamentos", legal: "Ipanema Pagamentos Ltda", country: "BR", city: "São Paulo", postal: "01310-100", address: "Avenida Paulista 1000", currency: "USD" },
  { slug: "za", name: "Table Bay Insurance", legal: "Table Bay Insurance (Pty) Ltd", country: "ZA", city: "Cape Town", postal: "8001", address: "1 Adderley Street", currency: "USD" },
  { slug: "in-ka", name: "Kaveri Payments", legal: "Kaveri Payments Private Limited", country: "IN", city: "Bengaluru", postal: "560001", address: "21 MG Road", currency: "INR", state: "29", gstin: "29AAACK1234A1Z5" },
  { slug: "in-mh", name: "Sahyadri Health", legal: "Sahyadri Health Private Limited", country: "IN", city: "Mumbai", postal: "400001", address: "8 Dalal Street, Fort", currency: "INR", state: "27", gstin: "27AAACS5678B1Z2" },
  { slug: "in-dl", name: "Yamuna SaaS", legal: "Yamuna SaaS Private Limited", country: "IN", city: "New Delhi", postal: "110001", address: "14 Connaught Place", currency: "USD", state: "07", gstin: "07AAACY9012C1Z8" },
];

// Bounty tables (minor units): none, low, medium, high, critical ranges. High is awarded.
const POLICY = {
  USD: [0, 0, 10000, 50000, 50000, 150000, 150000, 500000, 500000, 2000000],
  INR: [0, 0, 500000, 2500000, 2500000, 7500000, 7500000, 15000000, 15000000, 50000000],
};
const AWARD = { USD: 250000, INR: 10000000 };

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

async function inTx<T>(claims: object, role: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify(claims)]);
    await client.query(`set local role ${role}`);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
const asService = <T>(fn: (c: PoolClient) => Promise<T>) => inTx({ sub: "", role: "service_role" }, "service_role", fn);
const asUser = <T>(userId: string, fn: (c: PoolClient) => Promise<T>, sessionId?: string) => inTx({ sub: userId, session_id: sessionId, role: "authenticated" }, "authenticated", fn);
async function asPlatformAdmin<T>(userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const sessionId = randomUUID();
  await asService((c) => c.query("insert into public.sessions (id, user_id, token_hash, aal) values ($1, $2, $3, 'aal2')", [sessionId, userId, `seed-${sessionId}`]));
  try {
    return await asUser(userId, fn, sessionId);
  } finally {
    await asService((c) => c.query("delete from public.sessions where id = $1", [sessionId]));
  }
}
const one = async <T>(c: PoolClient, sql: string, args: unknown[] = []) => (await c.query(sql, args)).rows[0] as T;

async function step<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.log(`    ! ${label}: ${(error as Error).message.split("\n")[0]}`);
    return null;
  }
}

async function userId(email: string): Promise<string | null> {
  return (await asService((c) => one<{ id: string } | undefined>(c, "select id from public.users where email = $1", [email])))?.id ?? null;
}

async function ensureHunter(): Promise<string> {
  const existing = await userId(HUNTER_EMAIL);
  if (existing) return existing;
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const created = await asService((c) => one<{ id: string }>(c, "select * from public.create_user($1, $2, $3, $4)", [HUNTER_EMAIL, hash, "Showcase Hunter", "showcase_hunter"]));
  await asService((c) => c.query("update public.users set email_verified_at = now(), account_type = 'researcher', submission_daily_cap_override = 1000 where id = $1", [created.id]));
  return created.id;
}

async function ensureOwner(company: Company): Promise<string> {
  const email = `showcase.${company.slug}@unpatched.demo`;
  const existing = await userId(email);
  if (existing) return existing;
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const created = await asService((c) => one<{ id: string }>(c, "select * from public.create_user($1, $2, $3, $4)", [email, hash, `${company.name} security team`, `showcase_${company.slug.replace("-", "_")}`]));
  await asService((c) => c.query("update public.users set email_verified_at = now(), account_type = 'organization' where id = $1", [created.id]));
  return created.id;
}

async function seedCompany(company: Company, hunterId: string, adminId: string): Promise<void> {
  console.log(`- ${company.name} (${company.country}, ${company.currency})`);
  const ownerId = await ensureOwner(company);
  let org = await asService((c) => one<{ id: string } | undefined>(c, "select id from public.organizations where name = $1 and created_by = $2", [company.name, ownerId]));
  if (!org) org = await asUser(ownerId, (c) => one<{ id: string }>(c, "select * from public.create_organization($1)", [company.name]));
  const orgId = org.id;

  const paid = await asService((c) => one<{ n: number }>(c, "select count(*)::int as n from public.payment_obligations where organization_id = $1 and status = 'succeeded'", [orgId]));
  if (paid.n > 0) {
    console.log("    already has a paid award -- skipped");
    return;
  }

  await step("billing profile", () =>
    asUser(ownerId, (c) => c.query("select public.upsert_billing_profile($1, $2, $3, $4, $5, $6, $7, $8)", [orgId, company.legal, company.gstin ?? null, company.address, company.city, company.postal, company.country, company.state ?? null])),
  );

  const programName = `${company.name} Bug Bounty`;
  let program = await asService((c) => one<{ id: string; status: string } | undefined>(c, "select id, status from public.programs where organization_id = $1 and name = $2", [orgId, programName]));
  if (!program) program = await asUser(ownerId, (c) => one<{ id: string; status: string }>(c, "select id, status from public.create_program($1, $2)", [orgId, programName]));
  const programId = program.id;
  const target = `app.${company.slug}.example`;
  if (program.status === "draft") {
    await step("scope", () => asUser(ownerId, (c) => c.query("select public.add_scope_entry($1, $2, $3, $4, $5)", [programId, "domain", target, "in_scope", "Main web application."])));
    await step("submit for review", () => asUser(ownerId, (c) => c.query("select public.submit_program_for_review($1)", [programId])));
    await step("launch approval", () => asPlatformAdmin(adminId, (c) => c.query("select public.activate_program($1)", [programId])));
    await step("make public", () => asUser(ownerId, (c) => c.query("select public.set_program_visibility($1, $2)", [programId, "public"])));
  }
  await step("bounty table", () => asUser(ownerId, (c) => c.query("select public.create_bounty_policy_version($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)", [programId, company.currency, ...POLICY[company.currency]])));

  await step("researcher joins", () => asUser(hunterId, (c) => c.query("select public.join_public_program($1)", [programId])));
  const title = `Stored XSS in ${company.name} account settings`;
  let report = await asService((c) => one<{ id: string; status: string } | undefined>(c, "select id, status from public.reports where program_id = $1 and title = $2", [programId, title]));
  if (!report) {
    report = (await step("submit report", () =>
      asUser(hunterId, async (c) => {
        await c.query("select set_config('app.acknowledged_policy_version', coalesce((select version_number::text from public.program_policy_versions where program_id = $1 and superseded_at is null), ''), true)", [programId]);
        return one<{ id: string; status: string }>(c, "select id, status from public.submit_report($1, $2, $3, $4, $5, $6, $7, $8)", [
          programId, "domain", target, title,
          "The display-name field on the account settings page is rendered without encoding, so a crafted name runs script for anyone who views the profile.",
          "cross_site_scripting", "An attacker can act as any viewer of the profile, including support staff.", "high",
        ]);
      }),
    )) ?? undefined;
  }
  if (!report) return;
  const reportId = report.id;
  if (report.status === "new") {
    await step("triage", () => asUser(ownerId, (c) => c.query("select public.start_triage($1)", [reportId])));
    await step("severity", () => asUser(ownerId, (c) => c.query("select public.set_report_severity($1, $2)", [reportId, "high"])));
    await step("accept", () => asUser(ownerId, (c) => c.query("select public.accept_report($1)", [reportId])));
    await step("resolve", () => asUser(ownerId, (c) => c.query("select public.resolve_report($1, $2)", [reportId, "Output encoding added to the profile template; regression test in place."])));
  }

  // Fund the balance (a confirmed deposit, as if the transfer had arrived), then award and pay.
  await asService((c) =>
    c.query(
      `insert into public.organization_deposits (organization_id, currency, amount_minor_units, method, payer_reference, status, requested_by, reviewed_at)
       values ($1, $2, $3, $4, $5, 'confirmed', $6, now()) on conflict do nothing`,
      [orgId, company.currency, AWARD[company.currency] * 10, company.currency === "INR" ? "neft" : "wire", `SHOWCASE-${company.slug.toUpperCase()}`, ownerId],
    ),
  );
  await step("calculate bounty", () => asUser(ownerId, (c) => c.query("select public.calculate_bounty_recommendation($1)", [reportId])));
  await step("finalize bounty", () => asUser(ownerId, (c) => c.query("select public.finalize_bounty($1, $2, $3)", [reportId, AWARD[company.currency], "High impact: account takeover of support staff."])));
  const obligation = await step("create payment", () => asUser(ownerId, (c) => one<{ id: string }>(c, "select id from public.create_payment_obligation($1)", [reportId])));
  if (!obligation) return;
  const attempt = await step("start payout", () => asUser(ownerId, (c) => one<{ id: string }>(c, "select id from public.initiate_manual_payment_attempt($1)", [obligation.id])));
  if (!attempt) return;
  await step("record payout sent", () =>
    asPlatformAdmin(adminId, (c) => c.query("select public.record_manual_payment_result($1, $2, $3, $4, $5)", [attempt.id, "succeeded", `SHOWCASE-PAYOUT-${company.slug.toUpperCase()}`, "", ""])),
  );
  // Paid in the middle of last month, so last month's invoice run picks it up.
  await asService((c) =>
    c.query("update public.payment_attempts set completed_at = date_trunc('month', now()) - interval '15 days' where id = $1 and state = 'succeeded'", [attempt.id]),
  );
  console.log("    paid");
}

async function main() {
  const adminId = await userId(ADMIN_EMAIL);
  if (!adminId) throw new Error("Run `ALLOW_TEST_ACCOUNTS=1 npm run seed:e2e` first (needs the platform admin).");
  const hunterId = await ensureHunter();
  for (const company of COMPANIES) await seedCompany(company, hunterId, adminId);

  const issued = await step("issue last month's invoices", () =>
    asPlatformAdmin(adminId, async (c) =>
      (
        await c.query(
          "select number, currency, total_minor_units, tax_note from public.issue_invoices_for_period((date_trunc('month', now()) - interval '1 month')::date, (date_trunc('month', now()) - interval '1 day')::date, $1::jsonb)",
          [JSON.stringify(SELLER)],
        )
      ).rows,
    ),
  );
  console.log(`\nInvoices issued now: ${issued?.length ?? 0}`);
  for (const inv of issued ?? []) console.log(`  ${inv.number}  ${inv.currency} ${(Number(inv.total_minor_units) / 100).toFixed(2)}  ${inv.tax_note}`);
  console.log(`\nSign in as showcase.<code>@unpatched.demo / ${PASSWORD} (e.g. showcase.de@unpatched.demo) and open Payments.`);
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
