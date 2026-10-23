import { describe, expect, it } from "vitest";
import { adminSession, fixture, inTx, newUser, userId, type Db } from "./db";

// Tax withheld at payout and the billing / earnings document reads (202610220040).

/** A live obligation of the seeded organization, moved to a fresh researcher so the rule under test applies. */
async function obligationFor(db: Db, researcher: string): Promise<{ id: string; gross: number; next: number }> {
  await db.query("reset role");
  const o = await db.one<{ id: string; amount_minor_units: string }>(
    "select o.id, o.amount_minor_units from public.payment_obligations o where not exists (select 1 from public.payout_tax_withholdings w where w.obligation_id = o.id) order by o.organization_id = $1 desc, o.created_at limit 1",
    [fixture.organizationId],
  );
  expect(o, "seed has a payment obligation").toBeTruthy();
  // Constraints tie researcher to the report; the trigger only reads researcher_id, so a test
  // can point the obligation at a researcher whose tax profile it controls.
  await db.query("set session_replication_role = replica");
  // Tax-only by default: a fee from 202610230001 is set explicitly by the tests that need one.
  await db.query("update public.payment_obligations set researcher_id = $2, researcher_fee_minor_units = 0 where id = $1", [o.id, researcher]);
  await db.query("set session_replication_role = origin");
  const next = await db.one<{ n: number }>("select coalesce(max(attempt_number), 0) + 1 as n from public.payment_attempts where payment_obligation_id = $1", [o.id]);
  return { id: o.id, gross: Number(o.amount_minor_units), next: next.n };
}

async function attempt(db: Db, obligationId: string, n: number): Promise<number> {
  const a = await db.one<{ requested_amount_minor_units: string }>(
    "insert into public.payment_attempts (payment_obligation_id, attempt_number, provider, state, requested_amount_minor_units, currency) values ($1, $2, 'manual', 'requires_operator_action', 1, 'USD') returning requested_amount_minor_units",
    [obligationId, n],
  );
  return Number(a.requested_amount_minor_units);
}

describe("tax withheld at payout", () => {
  it("India without a PAN withholds 20%; the deduction is frozen and retries ask for the same net", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await db.as({ user: r });
      await db.query("select public.set_my_tax_residence('in')");
      const ob = await obligationFor(db, r);
      const net = await attempt(db, ob.id, ob.next);
      const expectedWithheld = Math.floor((ob.gross * 2000 + 5000) / 10000);
      expect(net).toBe(ob.gross - expectedWithheld);
      const w = await db.one<{ regime: string; rate_bps: number }>("select regime, rate_bps from public.payout_tax_withholdings where obligation_id = $1", [ob.id]);
      expect(w).toMatchObject({ regime: "in_206aa", rate_bps: 2000 });
      expect(await db.fails("update public.payout_tax_withholdings set withheld_minor_units = 0 where obligation_id = $1", [ob.id])).toMatch(/TAX_RECORD_IMMUTABLE/);
      // A rule change after the first attempt does not move a payout already decided.
      await db.as({ user: r });
      await db.query("select public.set_my_tax_residence('US')");
      await db.query("reset role");
      await db.query("update public.payment_attempts set state = 'failed', completed_at = now(), failure_code = 'test' where payment_obligation_id = $1 and attempt_number = $2", [ob.id, ob.next]);
      expect(await attempt(db, ob.id, ob.next + 1)).toBe(net);
    });
  });

  it("US: backup withholding 24% without a W-9 TIN, none with one; other countries withhold nothing", async () => {
    await inTx(async (db) => {
      const us = await newUser(db, "researcher");
      await db.as({ user: us });
      await db.query("select public.set_my_tax_residence('US')");
      const a = await obligationFor(db, us);
      expect(await attempt(db, a.id, a.next)).toBe(a.gross - Math.floor((a.gross * 2400 + 5000) / 10000));

      const w9 = await newUser(db, "researcher");
      await db.query("insert into public.researcher_payout_details (user_id, tax_residence_country, tax_form_type, tax_id_encrypted, tax_id_last4, tax_form_status) values ($1, 'US', 'w9', private.encrypt_sensitive_field('123456789'), '6789', 'pending')", [w9]);
      const b = await obligationFor(db, w9);
      expect(await attempt(db, b.id, b.next)).toBe(b.gross);

      const de = await newUser(db, "researcher");
      await db.as({ user: de });
      await db.query("select public.set_my_tax_residence('DE')");
      const c = await obligationFor(db, de);
      expect(await attempt(db, c.id, c.next)).toBe(c.gross);
      const regimes = await db.rows<{ regime: string }>("select regime from public.payout_tax_withholdings where obligation_id = any($1) order by gross_minor_units", [[a.id, b.id, c.id]]);
      expect(regimes.map((x) => x.regime).sort()).toEqual(["none", "us_1099", "us_backup"]);
    });
  });

  it("a researcher reads only their own deductions and tax identity", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      const other = await newUser(db, "researcher");
      await db.as({ user: r });
      await db.query("select public.set_my_tax_residence('IN')");
      const ob = await obligationFor(db, r);
      await attempt(db, ob.id, ob.next);
      await db.as({ user: other });
      expect((await db.rows("select * from public.payout_tax_withholdings")).length).toBe(0);
      await db.as({ user: r });
      expect((await db.rows("select * from public.payout_tax_withholdings")).length).toBe(1);
      const id = await db.one<{ tax_residence_country: string; next_regime: string }>("select * from public.get_my_tax_identity()");
      expect(id).toMatchObject({ tax_residence_country: "IN", next_regime: "in_206aa" });
    });
  });
});

describe("billing documents", () => {
  it("credit notes follow the invoice's GST split and can never exceed what it billed", async () => {
    await inTx(async (db) => {
      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      const session = await adminSession(db, admin);
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      const inv = await db.one<{ id: string }>(
        `insert into public.invoices (organization_id, number, financial_year, currency, period_start, period_end, issued_by, seller, buyer, subtotal_minor_units, igst_minor_units, total_minor_units, tax_note)
         values ($1, 'UNP/TEST/' || gen_random_uuid(), '2026-27', 'INR', '2026-09-01', '2026-09-30', $2, '{"name":"Seller"}', '{"name":"Buyer"}', 10000, 1800, 11800, 'test') returning id`,
        [fixture.organizationId, admin],
      );
      await db.as({ user: owner });
      expect(await db.fails("select public.issue_invoice_note($1, 'credit', 100, 'refund for a cancelled award')", [inv.id])).toMatch(/FORBIDDEN/);
      await db.as({ user: admin, session });
      const note = await db.one<{ igst_minor_units: string; total_minor_units: string; number: string }>("select * from public.issue_invoice_note($1, 'credit', 4000, 'refund for a cancelled award')", [inv.id]);
      expect(note).toMatchObject({ igst_minor_units: "720", total_minor_units: "4720" });
      expect(note.number).toMatch(/^UNP-CN\/\d{4}-\d{2}\/\d{5}$/);
      expect(await db.fails("select public.issue_invoice_note($1, 'credit', 6001, 'too much credit')", [inv.id])).toMatch(/CREDIT_EXCEEDS_INVOICE/);
      await db.query("select public.issue_invoice_note($1, 'debit', 1000, 'late fee adjustment')", [inv.id]);
      expect(await db.fails("select public.issue_invoice_note($1, 'credit', 7000, 'credit up to the debit')", [inv.id])).toBeNull();
      await db.as({ user: owner });
      expect((await db.rows("select number from public.invoice_notes where invoice_id = $1", [inv.id])).length).toBe(3);
    });
  });

  it("the wallet ledger opens and closes on the same arithmetic as the balance, finance roles only", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      const researcher = await userId(db, "e2e.hunter@unpatched.demo");
      await db.as({ user: owner });
      for (const b of await db.rows<{ currency: string; available: string }>("select currency, available from public.get_organization_balances($1)", [fixture.organizationId])) {
        const rows = await db.rows<{ kind: string; amount_minor_units: string }>(
          "select kind, amount_minor_units from public.get_organization_wallet_ledger($1, $2, current_date - 400, current_date)",
          [fixture.organizationId, b.currency],
        );
        expect(rows[0].kind).toBe("opening");
        expect(rows.reduce((sum, r) => sum + Number(r.amount_minor_units), 0)).toBe(Number(b.available));
      }
      expect((await db.rows("select * from public.list_organization_bounty_history($1, current_date - 400, current_date)", [fixture.organizationId])).length).toBeGreaterThan(0);
      await db.as({ user: researcher });
      expect(await db.fails("select * from public.get_organization_wallet_ledger($1, 'USD', current_date - 30, current_date)", [fixture.organizationId])).toMatch(/FORBIDDEN/);
      expect(await db.fails("select * from public.list_organization_bounty_history($1, current_date - 30, current_date)", [fixture.organizationId])).toMatch(/FORBIDDEN/);
      expect(await db.fails("select * from public.list_my_payouts(null, null)")).toBeNull();
    });
  });
});

describe("fee from the researcher (202610230001)", () => {
  it("an Indian resident's payout nets bounty - TDS on the full bounty - fee - 18% GST on the fee, with a numbered fee invoice", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await db.as({ user: r });
      await db.query("select public.set_my_tax_residence('IN')");
      const ob = await obligationFor(db, r);
      const fee = Math.floor(ob.gross / 5);
      await db.query("set session_replication_role = replica");
      await db.query("update public.payment_obligations set researcher_fee_minor_units = $2, platform_fee_minor_units = 0 where id = $1", [ob.id, fee]);
      await db.query("set session_replication_role = origin");
      const net = await attempt(db, ob.id, ob.next);
      const tds = Math.floor((ob.gross * 2000 + 5000) / 10000);
      const gst = Math.floor((fee * 18 + 50) / 100);
      expect(net).toBe(ob.gross - tds - fee - gst);
      const w = await db.one<{ fee_invoice_number: string }>("select fee_invoice_number from public.payout_tax_withholdings where obligation_id = $1", [ob.id]);
      expect(w.fee_invoice_number).toMatch(/^UNP-RF\/\d{4}-\d{2}\/\d{5}$/);
    });
  });
});

describe("audit log search (202610230001)", () => {
  it("filters by category and text, owners and security admins only", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      const triager = await userId(db, "e2e.triager@unpatched.demo");
      await db.as({ user: owner });
      const scope = await db.rows<{ action: string }>("select action from public.search_organization_audit_log($1, 'scope', null, null, null)", [fixture.organizationId]);
      expect(scope.length).toBeGreaterThan(0);
      expect(scope.every((e) => /^(scope\.|asset\.|report\.asset_)/.test(e.action))).toBe(true);
      const removed = await db.rows<{ action: string }>("select action from public.search_organization_audit_log($1, null, 'asset_removed', null, null)", [fixture.organizationId]);
      expect(removed.every((e) => e.action.includes("asset_removed"))).toBe(true);
      await db.as({ user: triager });
      expect(await db.fails("select * from public.search_organization_audit_log($1, null, null, null, null)", [fixture.organizationId])).toMatch(/FORBIDDEN/);
    });
  });
});

describe("Indian TDS threshold (202610230004)", () => {
  it("deducts nothing within Rs 50,000 a year, then tax on the whole year's amount on the payout that crosses it", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await db.as({ user: r });
      await db.query("select public.set_my_tax_residence('IN')");
      const first = await obligationFor(db, r);
      await db.query("set session_replication_role = replica");
      await db.query("update public.payment_obligations set currency = 'INR', amount_minor_units = 4000000 where id = $1", [first.id]); // Rs 40,000
      await db.query("set session_replication_role = origin");
      expect(await attempt(db, first.id, first.next)).toBe(4000000);
      const second = await obligationFor(db, r);
      await db.query("set session_replication_role = replica");
      await db.query("update public.payment_obligations set currency = 'INR', amount_minor_units = 2000000 where id = $1", [second.id]); // Rs 20,000
      await db.query("set session_replication_role = origin");
      // Rs 60,000 for the year at 20% (no PAN) = Rs 12,000, all deducted from this payout.
      expect(await attempt(db, second.id, second.next)).toBe(2000000 - 1200000);
      const basis = await db.one<{ legal_basis: string }>("select legal_basis from public.payout_tax_withholdings where obligation_id = $1", [second.id]);
      expect(basis.legal_basis).toMatch(/section 393.*Threshold crossed/);
    });
  });
});

describe("organization onboarding (202610230005)", () => {
  it("reads progress from what the organization did; admins see launch checks; others are refused", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      const triager = await userId(db, "e2e.triager@unpatched.demo");
      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      await db.as({ user: owner });
      const { j } = await db.one<{ j: Record<string, unknown> }>("select public.get_organization_onboarding($1) as j", [fixture.organizationId]);
      expect(j).toMatchObject({ program_created: true, scope_added: true, launched: true, funded: true });
      await db.as({ user: triager });
      expect(await db.fails("select public.get_organization_onboarding($1)", [fixture.organizationId])).toMatch(/FORBIDDEN/);
      expect(await db.fails("select * from public.list_program_launch_readiness()")).toMatch(/FORBIDDEN/);
      const session = await adminSession(db, admin);
      await db.as({ user: admin, session });
      expect(await db.fails("select * from public.list_program_launch_readiness()")).toBeNull();
    });
  });
});

describe("invite by username (202610230006)", () => {
  it("invites without the organization ever seeing the email; refuses unknown names and duplicates; suggestions exclude people already in", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      const researcher = await newUser(db, "researcher");
      // Only researchers with a public profile have a public username to be invited by.
      const handle = `pilot-${researcher.slice(0, 8)}`;
      await db.query("update public.users set public_username = $2 where id = $1", [researcher, handle]);
      await db.as({ user: owner });
      const inv = await db.one<{ id: string; email: string; invited_username: string }>("select * from public.invite_researcher_by_username($1, $2, 'Join our pilot', 'hash-' || gen_random_uuid())", [fixture.privateProgramId, `@${handle}`]);
      expect(inv.invited_username).toBe(handle);
      expect(inv.email).toMatch(/@unpatched\.demo$/); // kept for delivery and the accept match
      await db.query("reset role");
      const audit = await db.one<{ metadata: Record<string, unknown> }>("select metadata from public.audit_logs where entity_id = $1", [inv.id]);
      expect(audit.metadata).toEqual({ program_id: fixture.privateProgramId, username: `@${handle}` });
      await db.as({ user: owner });
      expect(await db.fails("select public.invite_researcher_by_username($1, $2, '', 'h2')", [fixture.privateProgramId, handle])).toMatch(/INVITATION_PENDING/);
      expect(await db.fails("select public.invite_researcher_by_username($1, 'nobody_has_this_name_x', '', 'h3')", [fixture.privateProgramId])).toMatch(/RESEARCHER_NOT_FOUND/);
      const suggested = await db.rows<{ public_username: string }>("select public_username from public.suggest_program_researchers($1, 25)", [fixture.privateProgramId]);
      expect(suggested.some((s) => s.public_username === handle)).toBe(false);
      await db.as({ user: researcher });
      expect(await db.fails("select public.invite_researcher_by_username($1, $2, '', 'h4')", [fixture.privateProgramId, handle])).toMatch(/FORBIDDEN/);
      expect(await db.fails("select * from public.suggest_program_researchers($1)", [fixture.privateProgramId])).toMatch(/FORBIDDEN/);
    });
  });
});

describe("identity before reporting (202610230008)", () => {
  it("refuses a report from a researcher with no verified identity, on every path", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await db.query("delete from public.researcher_kyc where user_id = $1", [r]);
      await db.as({ user: r });
      expect((await db.one<{ v: boolean }>("select public.am_i_identity_verified() as v")).v).toBe(false);
      await db.query("select public.join_public_program($1)", [fixture.publicProgramId]);
      await db.query(
        "select set_config('app.acknowledged_policy_version', coalesce((select version_number::text from public.program_policy_versions where program_id = $1 and superseded_at is null), ''), true)",
        [fixture.publicProgramId],
      );
      expect(
        await db.fails("select public.submit_report($1, 'domain', 'api.e2e-public.example', 'Unverified', 'A finding from an unverified account long enough to pass checks', 'cross_site_scripting', 'i', 'low')", [fixture.publicProgramId]),
      ).toMatch(/KYC_REQUIRED/);
    });
  });
});
