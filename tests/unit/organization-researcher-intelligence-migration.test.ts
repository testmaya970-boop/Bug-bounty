import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Static source-level checks on the new migration, matching the established convention
// in tests/unit/migration-security.test.ts: these prove the properties below are PRESENT
// IN SOURCE (regression protection if someone edits this file later). Real runtime
// behavior was verified live against a local Supabase stack in this session (org
// isolation/authorization, a real mixed-state researcher, resolved-only counting, and
// recency all confirmed by direct psql calls against list_researchers_for_organization) --
// this file is the fast-running, CI-safe regression layer underneath that, not a
// replacement for it.

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationPath = `${repoRoot}supabase/migrations/202609060002_organization_researcher_intelligence.sql`;
const sql = readFileSync(migrationPath, "utf8");

describe("list_researchers_for_organization: authorization", () => {
  it("is a SECURITY DEFINER function with search_path pinned to ''", () => {
    expect(sql).toMatch(/create or replace function public\.list_researchers_for_organization\(target_organization_id uuid\)[\s\S]*?security definer set search_path = ''/);
  });

  it("calls the existing authorize_organization_analytics_read gate as its first statement, reusing it rather than defining a new authorization primitive", () => {
    const functionStart = sql.indexOf("create or replace function public.list_researchers_for_organization");
    const bodyStart = sql.indexOf("begin", functionStart);
    const firstStatementEnd = sql.indexOf(";", bodyStart);
    const firstStatement = sql.slice(bodyStart, firstStatementEnd);
    expect(firstStatement).toContain("perform private.authorize_organization_analytics_read(target_organization_id)");
    expect(sql).not.toMatch(/create or replace function private\.authorize_organization_analytics_read/);
  });

  it("is revoked from public and granted only to authenticated, matching the existing organization-analytics RPCs", () => {
    expect(sql).toMatch(/revoke all on function public\.list_researchers_for_organization\(uuid\) from public;/);
    expect(sql).toMatch(/grant execute on function public\.list_researchers_for_organization\(uuid\) to authenticated;/);
  });

  it("scopes every CTE to the caller-supplied target_organization_id, never a bare unscoped table read", () => {
    // org_programs and org_reports are the only two CTEs that read a base table directly;
    // every other CTE derives from one of those two. Both must filter by the parameter.
    expect(sql).toMatch(/org_programs as \(\s*select p\.id as program_id, p\.name as program_name\s*from public\.programs p\s*where p\.organization_id = target_organization_id/);
    expect(sql).toMatch(/org_reports as \(\s*select rp\.researcher_id, rp\.status, rp\.confirmed_severity, rp\.submitted_at\s*from public\.reports rp\s*where rp\.organization_id = target_organization_id/);
  });
});

describe("list_researchers_for_organization: relationship, contribution, and recency semantics", () => {
  it("joins program_researchers through org_programs (by program_id), never filtering program_researchers.organization_id directly -- that column has no supporting index", () => {
    expect(sql).toMatch(/from public\.program_researchers pr\s*join org_programs op on op\.program_id = pr\.program_id/);
    expect(sql).not.toMatch(/program_researchers[\s\S]{0,80}where[\s\S]{0,80}\.organization_id = target_organization_id/);
  });

  it("preserves every (program, status) relationship as its own jsonb array element via jsonb_agg, never collapsing to one status per researcher", () => {
    expect(sql).toContain("jsonb_agg(jsonb_build_object('programId', r.program_id, 'programName', r.program_name, 'status', r.status)");
  });

  it("counts resolved_count and every severity bucket only where status = 'resolved'", () => {
    expect(sql).toMatch(/resolved_contribution as \([\s\S]*?where org_reports\.status = 'resolved'/);
  });

  it("resolved_none includes both an explicit confirmed_severity = 'none' and a NULL confirmed_severity", () => {
    expect(sql).toContain("count(*) filter (where org_reports.confirmed_severity = 'none' or org_reports.confirmed_severity is null) as resolved_none");
  });

  it("computes last_submitted_at as MAX(submitted_at) over every historical report for that researcher, with no status filter applied to the recency CTE", () => {
    const recencyStart = sql.indexOf("recency as (");
    const recencyEnd = sql.indexOf(")", sql.indexOf("group by", recencyStart));
    const recencyBody = sql.slice(recencyStart, recencyEnd);
    expect(recencyBody).toContain("max(org_reports.submitted_at) as last_submitted_at");
    expect(recencyBody).not.toMatch(/where[\s\S]*status/);
  });

  it("does not reference payments, spend, reputation, email, username, or duplicate/informative/not_applicable/rejected counts in actual code (comments may explain why these are excluded)", () => {
    const codeOnly = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .toLowerCase();
    const forbidden = ["payment", "spend", "reputation", "email", "username", "duplicate", "informative", "not_applicable", "rejected"];
    for (const term of forbidden) {
      expect(codeOnly).not.toContain(term);
    }
  });
});
