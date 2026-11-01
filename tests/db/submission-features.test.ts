import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ackPolicy, fixture, inTx, newUser, userId, type Db } from "./db";

// Oct 26 submission features (202610260001-0007), enforced in the database: chosen scope entry,
// idempotent submit, researcher CVSS, drafts, staged uploads, priority-driven payouts, external
// handles, and Aadhaar only through the provider.

// The description embeds the title and the submission key: the near-duplicate guard compares
// descriptions, and each call here is meant to be a distinct report (except the idempotency test).
const SUBMIT =
  "select * from public.submit_report($1::uuid, 'domain', $2::text, $3::text, 'Finding ' || $3::text || ' reference ' || $10::text || ' with steps to reproduce', 'cross_site_scripting', 'Impact', 'low', $4::uuid, $5::text, $6::text, $7::numeric, $8::uuid, $9::uuid[], $10::uuid)";

async function researcherOnPublicProgram(db: Db): Promise<string> {
  const r = await newUser(db, "researcher");
  await db.query("reset role");
  await db.query("update public.users set submission_daily_cap_override = 100 where id = $1", [r]);
  await db.as({ user: r });
  await db.query("select public.join_public_program($1)", [fixture.publicProgramId]);
  await ackPolicy(db, fixture.publicProgramId);
  return r;
}

async function entryId(db: Db, target: string): Promise<string> {
  await db.query("reset role");
  const row = await db.one<{ id: string }>("select id from public.program_scope_entries where program_id = $1 and target = $2 and status = 'active'", [fixture.publicProgramId, target]);
  return row.id;
}

describe("submit_report: chosen asset, idempotency, researcher CVSS", () => {
  it("refuses a target whose own scope match is not the asset the researcher picked", async () => {
    await inTx(async (db) => {
      const other = await db.one<{ target: string }>("select target from public.program_scope_entries where program_id = $1 and target <> 'api.e2e-public.example' and scope_state = 'in_scope' and status = 'active' limit 1", [fixture.publicProgramId]);
      const otherId = await entryId(db, other.target);
      const r = await researcherOnPublicProgram(db);
      expect(r).toBeTruthy();
      const error = await db.fails(SUBMIT, [fixture.publicProgramId, "api.e2e-public.example", "Picked the wrong asset", otherId, null, null, null, null, null, randomUUID()]);
      expect(error).toMatch(/TARGET_NOT_ELIGIBLE: This target is not covered by the asset you selected/);
      const rightId = await entryId(db, "api.e2e-public.example");
      await db.as({ user: r });
      expect(await db.fails(SUBMIT, [fixture.publicProgramId, "api.e2e-public.example", "Picked the right asset", rightId, null, null, null, null, null, randomUUID()])).toBeNull();
    });
  });

  it("a retried submit with the same key returns the same report instead of a second one", async () => {
    await inTx(async (db) => {
      const rightId = await entryId(db, "api.e2e-public.example");
      await researcherOnPublicProgram(db);
      const key = randomUUID();
      const first = await db.one<{ id: string }>(SUBMIT, [fixture.publicProgramId, "api.e2e-public.example", "Idempotent submit", rightId, null, null, null, null, null, key]);
      const second = await db.one<{ id: string }>(SUBMIT, [fixture.publicProgramId, "api.e2e-public.example", "Idempotent submit", rightId, null, null, null, null, null, key]);
      expect(second.id).toBe(first.id);
    });
  });

  it("stores the researcher's CVSS; a malformed vector is refused by the database", async () => {
    await inTx(async (db) => {
      const rightId = await entryId(db, "api.e2e-public.example");
      await researcherOnPublicProgram(db);
      const v4 = "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N";
      const report = await db.one<{ researcher_cvss_version: string; researcher_cvss_score: string }>(SUBMIT, [fixture.publicProgramId, "api.e2e-public.example", "With CVSS", rightId, "4.0", v4, 9.3, null, null, randomUUID()]);
      expect(report).toMatchObject({ researcher_cvss_version: "4.0", researcher_cvss_score: "9.3" });
      expect(await db.fails(SUBMIT, [fixture.publicProgramId, "api.e2e-public.example", "Bad CVSS", rightId, "4.0", "CVSS:4.0/AV:Q", 9.3, null, null, randomUUID()])).toMatch(/reports_researcher_cvss_shape_check/);
      expect(await db.fails(SUBMIT, [fixture.publicProgramId, "api.e2e-public.example", "Unscored CVSS", rightId, "4.0", v4, null, null, null, randomUUID()])).toMatch(/INVALID_CVSS/);
    });
  });

  it("the original 8-argument signature still works", async () => {
    await inTx(async (db) => {
      await researcherOnPublicProgram(db);
      expect(await db.fails("select public.submit_report($1, 'domain', 'api.e2e-public.example', 'Legacy caller', 'A legacy finding long enough to pass every check here', 'sql_injection', 'i', 'low')", [fixture.publicProgramId])).toBeNull();
    });
  });
});

describe("drafts", () => {
  it("many drafts per program, versioned saves, conflicts refused, private to the owner", async () => {
    await inTx(async (db) => {
      const r = await researcherOnPublicProgram(db);
      const a = await db.one<{ id: string; version: number }>("select * from public.save_my_report_draft(null, $1, '{\"title\":\"A\"}'::jsonb, null)", [fixture.publicProgramId]);
      const b = await db.one<{ id: string }>("select * from public.save_my_report_draft(null, $1, '{\"title\":\"B\"}'::jsonb, null)", [fixture.publicProgramId]);
      expect(a.id).not.toBe(b.id);
      const saved = await db.one<{ version: number }>("select * from public.save_my_report_draft($1, $2, '{\"title\":\"A2\"}'::jsonb, $3)", [a.id, fixture.publicProgramId, a.version]);
      expect(saved.version).toBe(a.version + 1);
      // A second tab still holding the old version must not overwrite.
      expect(await db.fails("select * from public.save_my_report_draft($1, $2, '{\"title\":\"stale\"}'::jsonb, $3)", [a.id, fixture.publicProgramId, a.version])).toMatch(/DRAFT_CONFLICT/);
      expect((await db.rows("select id from public.report_drafts")).length).toBe(2);

      const other = await newUser(db, "researcher");
      await db.as({ user: other });
      expect(await db.rows("select id from public.report_drafts where id = $1", [a.id])).toHaveLength(0);
      expect(await db.fails("select * from public.save_my_report_draft($1, $2, '{}'::jsonb, null)", [a.id, fixture.publicProgramId])).toMatch(/FORBIDDEN|DRAFT_NOT_FOUND/);
      await db.as({ user: r });
      await db.query("select public.delete_my_report_draft($1)", [b.id]);
      expect((await db.rows("select id from public.report_drafts")).length).toBe(1);
    });
  });
});

describe("staged uploads", () => {
  it("only verified uploads become evidence; submit attaches them atomically and consumes the draft", async () => {
    await inTx(async (db) => {
      const rightId = await entryId(db, "api.e2e-public.example");
      const r = await researcherOnPublicProgram(db);
      const draft = await db.one<{ id: string }>("select * from public.save_my_report_draft(null, $1, '{}'::jsonb, null)", [fixture.publicProgramId]);
      const upload = await db.one<{ id: string; object_key: string; status: string }>("select * from public.create_evidence_upload($1, null, null, 'proof.png', 'image/png', 1234, 20)", [draft.id]);
      expect(upload.status).toBe("pending");
      expect(upload.object_key).toMatch(/^evidence\/[0-9a-f-]{36}$/);

      // Not verified yet: submitting with it fails as a whole (no report is created).
      expect(await db.fails(SUBMIT, [fixture.publicProgramId, "api.e2e-public.example", "Too early", rightId, null, null, null, draft.id, [upload.id], randomUUID()])).toMatch(/UPLOAD_NOT_READY/);
      await db.as({ user: r });
      expect(await db.rows("select id from public.reports where researcher_id = $1 and title = 'Too early'", [r])).toHaveLength(0);

      // Someone else can't mark it verified.
      const other = await newUser(db, "researcher");
      await db.as({ user: other });
      expect(await db.fails("select public.mark_evidence_upload_ready($1, $2)", [upload.id, "a".repeat(64)])).toMatch(/UPLOAD_NOT_FOUND/);

      await db.as({ user: r });
      await db.query("select public.mark_evidence_upload_ready($1, $2)", [upload.id, "a".repeat(64)]);
      const report = await db.one<{ id: string }>(SUBMIT, [fixture.publicProgramId, "api.e2e-public.example", "With a file", rightId, null, null, null, draft.id, [upload.id], randomUUID()]);
      const evidence = await db.rows<{ object_key: string; size_bytes: string }>("select object_key, size_bytes from public.report_evidence where report_id = $1 and evidence_type = 'file'", [report.id]);
      expect(evidence).toEqual([{ object_key: upload.object_key, size_bytes: "1234" }]);
      expect(await db.rows("select id from public.report_drafts where id = $1", [draft.id])).toHaveLength(0);
    });
  });

  it("an unverified object can't be added as evidence to a report directly", async () => {
    await inTx(async (db) => {
      const r = await researcherOnPublicProgram(db);
      const report = await db.one<{ id: string }>("select id from public.submit_report($1, 'domain', 'api.e2e-public.example', 'Direct add', 'A finding long enough to pass the description check', 'idor', 'i', 'low')", [fixture.publicProgramId]);
      const key = `evidence/${randomUUID()}`;
      expect(await db.fails("select public.add_researcher_file_evidence($1, $2, 'x.png', 'image/png', 10, $3)", [report.id, key, "b".repeat(64)])).toMatch(/has not finished uploading/);
      expect(r).toBeTruthy();
    });
  });
});

describe("priority drives payout", () => {
  it("defaults from severity, an explicit priority picks the tier, and a finalized bounty locks it", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      const r = await db.one<{ id: string; program_id: string }>(
        `select r.id, r.program_id from public.reports r
         where r.organization_id = $1 and r.status in ('new', 'triaging', 'accepted')
           and exists (select 1 from public.program_bounty_policy_versions v where v.program_id = r.program_id and v.superseded_at is null)
           and not exists (select 1 from public.report_bounty_decisions d where d.report_id = r.id and d.state = 'finalized') limit 1`,
        [fixture.organizationId],
      );
      await db.query("update public.reports set confirmed_severity = 'high' where id = $1", [r.id]);
      const path = ["new", "triaging", "accepted", "resolved"];
      const { status } = await db.one<{ status: string }>("select status from public.reports where id = $1", [r.id]);
      for (const next of path.slice(path.indexOf(status) + 1)) await db.query("update public.reports set status = $2 where id = $1", [r.id, next]);
      const ranges = await db.rows<{ severity: string; max: string }>(
        "select s.severity, s.max_amount_minor_units as max from public.program_bounty_policy_severity_ranges s join public.program_bounty_policy_versions v on v.id = s.policy_version_id where v.program_id = $1 and v.superseded_at is null",
        [r.program_id],
      );
      const maxFor = (tier: string) => Number(ranges.find((x) => x.severity === tier)?.max);

      await db.as({ user: owner });
      await db.query("select public.calculate_bounty_recommendation($1)", [r.id]);
      const byDefault = await db.one<{ priority_at_calculation: string; severity_at_calculation: string }>("select priority_at_calculation, severity_at_calculation from public.report_bounty_decisions where report_id = $1", [r.id]);
      expect(byDefault).toEqual({ priority_at_calculation: "p1", severity_at_calculation: "high" });

      await db.query("select public.set_report_priority($1, 'p0')", [r.id]);
      await db.query("select public.calculate_bounty_recommendation($1)", [r.id]);
      const explicit = await db.one<{ priority_at_calculation: string; max: string; tier_percent: number }>(
        "select priority_at_calculation, calculated_max_amount_minor_units as max, tier_percent from public.report_bounty_decisions where report_id = $1",
        [r.id],
      );
      expect(explicit.priority_at_calculation).toBe("p0");
      expect(Number(explicit.max)).toBe(Math.round((maxFor("critical") * explicit.tier_percent) / 100));

      await db.query("reset role");
      await db.query("update public.report_bounty_decisions set state = 'finalized', final_amount_minor_units = calculated_min_amount_minor_units, finalized_by = $2, finalized_at = now() where report_id = $1", [r.id, owner]);
      expect(await db.fails("update public.reports set priority = 'p3' where id = $1", [r.id])).toMatch(/SEVERITY_LOCKED/);
    });
  });

  it("only triagers set priority", async () => {
    await inTx(async (db) => {
      const report = await db.one<{ id: string }>("select id from public.reports where organization_id = $1 limit 1", [fixture.organizationId]);
      await db.as({ user: await newUser(db, "researcher") });
      expect(await db.fails("select public.set_report_priority($1, 'p0')", [report.id])).toMatch(/FORBIDDEN|REPORT_NOT_FOUND|not authorized/i);
    });
  });
});

describe("external profiles", () => {
  it("validates handles, and lists them publicly only after the researcher opts in", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await db.query("reset role");
      const username = `dbtest-${r.slice(0, 8)}`;
      await db.query("update public.users set public_username = $2 where id = $1", [r, username]);
      await db.as({ user: r });
      expect(await db.fails("select public.update_my_external_handles('bad handle!', null, null, null, null, null, null, false)")).toMatch(/INVALID_HANDLE: HackerOne/);
      expect(await db.fails("select public.update_my_external_handles(null, null, null, '-starts-with-dash', null, null, null, false)")).toMatch(/INVALID_HANDLE: GitHub/);
      await db.query("select public.update_my_external_handles('jordan_h1', null, null, 'jordan', null, null, null, false)");
      await db.as("anon");
      expect(await db.rows("select * from public.get_public_researcher_links($1)", [username])).toHaveLength(0);
      await db.as({ user: r });
      await db.query("select public.update_my_external_handles('jordan_h1', null, null, 'jordan', null, null, null, true)");
      await db.as("anon");
      expect(await db.one("select hackerone_handle, github_handle from public.get_public_researcher_links($1)", [username])).toEqual({ hackerone_handle: "jordan_h1", github_handle: "jordan" });
    });
  });
});

describe("Aadhaar only through the provider", () => {
  it("refuses a new Aadhaar number from any caller; PAN still goes to manual review", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await db.as({ user: r });
      expect(await db.fails("select public.upsert_my_kyc(p_aadhaar_number => '123412341234')")).toMatch(/AADHAAR_VIA_PROVIDER/);
      expect(await db.fails("select public.upsert_my_kyc(p_pan_number => 'ABCDE1234F')")).toBeNull();
      await db.query("reset role");
      expect(await db.fails("update public.researcher_kyc set aadhaar_number_encrypted = '\\x00'::bytea where user_id = $1", [r])).toMatch(/AADHAAR_VIA_PROVIDER/);
    });
  });
});
