import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

// Static source-level checks on the migrations. These prove the properties below are
// PRESENT IN SOURCE (regression protection if someone edits these files later) -- they do
// not, by themselves, prove Postgres/PostgREST enforce them at runtime. That runtime proof
// was obtained separately, live, against a real local Supabase stack in this session (see
// docs/security/phase-2-rpc-review.md's "DATABASE VERIFIED" section and the engineering
// report); this file is the fast-running, CI-safe regression layer underneath that, not a
// replacement for it.

const migrationPath = `${repoRoot}db/migrations/202608260001_organization_membership_lifecycle.sql`;
const sql = readFileSync(migrationPath, "utf8");
const orgCreationMigrationPath = `${repoRoot}db/migrations/202608260003_organization_creation.sql`;
const orgCreationSql = readFileSync(orgCreationMigrationPath, "utf8");
const programFoundationMigrationPath = `${repoRoot}db/migrations/202608260004_program_foundation.sql`;
const programSql = readFileSync(programFoundationMigrationPath, "utf8");
const scopeMigrationPath = `${repoRoot}db/migrations/202608260005_program_scope_foundation.sql`;
const scopeSql = readFileSync(scopeMigrationPath, "utf8");
const researcherMigrationPath = `${repoRoot}db/migrations/202608260006_researcher_access_foundation.sql`;
const researcherSql = readFileSync(researcherMigrationPath, "utf8");
const reportMigrationPath = `${repoRoot}db/migrations/202608270001_report_foundation.sql`;
const reportSql = readFileSync(reportMigrationPath, "utf8");

const HELPERS = ["is_org_member", "has_org_role", "shares_organization_with"];
const MUTATION_RPCS = ["invite_organization_member", "accept_organization_invitation", "cancel_organization_invitation", "change_member_role", "suspend_member", "reactivate_member", "remove_member"];

describe("migration source: RLS helper functions are not publicly exposed", () => {
  it("creates a private schema", () => {
    expect(sql).toMatch(/create schema if not exists private;/);
  });

  for (const helper of HELPERS) {
    it(`defines private.${helper}, not public.${helper}`, () => {
      expect(sql).toContain(`create or replace function private.${helper}(`);
      expect(sql).not.toContain(`create or replace function public.${helper}(`);
    });

    it(`never references public.${helper}( anywhere in the file`, () => {
      // Every call site (RLS policies, RPC bodies) must use the private-schema-qualified
      // name. A stray public.<helper>( would mean an old call site was missed during the fix.
      expect(sql).not.toContain(`public.${helper}(`);
    });

    it(`grants EXECUTE on private.${helper} to authenticated (required for RLS evaluation)`, () => {
      expect(sql).toMatch(new RegExp(`grant execute on function private\\.${helper}\\([^)]*\\) to authenticated;`));
    });
  }

  it("grants USAGE on the private schema to authenticated, not to anon or PUBLIC", () => {
    expect(sql).toMatch(/grant usage on schema private to authenticated;/);
    expect(sql).not.toMatch(/grant usage on schema private to (anon|public)\b/i);
  });
});

describe("migration source: every SECURITY DEFINER function pins search_path to ''", () => {
  // Strip `--` comment lines first -- the file's prose comments legitimately say "SECURITY
  // DEFINER" and "search_path" many times when explaining the pattern; only actual code
  // lines should count toward this check.
  const codeOnly = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("has a matching search_path='' for each `security definer` occurrence in code", () => {
    const definerCount = (codeOnly.match(/security definer/gi) ?? []).length;
    const pinnedCount = (codeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    expect(definerCount).toBeGreaterThan(0);
    expect(pinnedCount).toBe(definerCount);
  });
});

describe("migration source: every mutation RPC derives the actor from auth.uid(), never a parameter", () => {
  for (const fn of MUTATION_RPCS) {
    it(`${fn} has no actor_id/user_id-as-caller parameter`, () => {
      const start = sql.indexOf(`create or replace function public.${fn}(`);
      expect(start, `${fn} should be defined in public (it is the intended API surface)`).toBeGreaterThan(-1);
      const signatureEnd = sql.indexOf(")", start);
      const signature = sql.slice(start, signatureEnd);
      expect(signature).not.toMatch(/actor_id|caller_id/);
    });

    it(`${fn} is granted to authenticated and revoked from public`, () => {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^;]*from public;`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to authenticated;`));
    });
  }
});

describe("migration source: the organizations RLS policy excludes non-active members (Phase 1 gap fix)", () => {
  it("recreates 'organizations read if member' using the status-aware private.is_org_member helper", () => {
    expect(sql).toMatch(/drop policy if exists "organizations read if member" on public\.organizations;/);
    expect(sql).toMatch(/create policy "organizations read if member" on public\.organizations[\s\S]*?using \(private\.is_org_member\(id\)\);/);
  });
});

describe("migration source: organization creation never trusts a client-supplied creator/owner", () => {
  it("create_organization's parameter list has no creator/owner/role argument", () => {
    const start = orgCreationSql.indexOf("function public.create_organization(");
    expect(start).toBeGreaterThan(-1);
    const signatureEnd = orgCreationSql.indexOf(")", start);
    const signature = orgCreationSql.slice(start, signatureEnd);
    expect(signature).not.toMatch(/created_by|owner|actor_id|role/);
    // The only two parameters are the name and an idempotency key.
    expect(signature).toContain("org_name text");
    expect(signature).toContain("p_idempotency_key uuid");
  });

  it("derives the actor from auth.uid(), never a parameter, and grants owner unconditionally on success", () => {
    const start = orgCreationSql.indexOf("function public.create_organization(");
    const bodyEnd = orgCreationSql.indexOf("\n$$;", start);
    const body = orgCreationSql.slice(start, bodyEnd);
    expect(body).toContain("actor uuid := auth.uid()");
    expect(body).toMatch(/insert into public\.organization_members[\s\S]*?'owner'/);
  });

  it("writes organization.created transactionally in the same function as the insert, not a separate step", () => {
    const start = orgCreationSql.indexOf("function public.create_organization(");
    const bodyEnd = orgCreationSql.indexOf("\n$$;", start);
    const body = orgCreationSql.slice(start, bodyEnd);
    expect(body).toContain("'organization.created'");
  });
});

describe("migration source: the new RPCs are granted to authenticated only, never anon", () => {
  const NEW_RPCS = ["create_organization", "list_my_pending_invitations", "accept_organization_invitation_by_id"];

  for (const fn of NEW_RPCS) {
    it(`${fn} has an explicit revoke-from-public / grant-to-authenticated pair`, () => {
      expect(orgCreationSql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^;]*from public;`));
      expect(orgCreationSql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to authenticated;`));
      expect(orgCreationSql).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to anon`));
    });
  }
});

describe("migration source: the idempotency key is a real unique constraint, not just a UI convention", () => {
  it("adds a per-creator unique index on organizations.idempotency_key", () => {
    expect(orgCreationSql).toMatch(/create unique index organizations_created_by_idempotency_key_idx on public\.organizations\(created_by, idempotency_key\) where idempotency_key is not null;/);
  });
});

describe("migration source: program creation never trusts a client-supplied creator/manager/role", () => {
  it("create_program's parameter list has no creator/manager/actor_id/role argument", () => {
    const start = programSql.indexOf("function public.create_program(");
    expect(start).toBeGreaterThan(-1);
    const signatureEnd = programSql.indexOf(")", start);
    const signature = programSql.slice(start, signatureEnd);
    expect(signature).not.toMatch(/created_by|manager|actor_id|role/);
    expect(signature).toContain("target_org_id uuid");
    expect(signature).toContain("program_name text");
    expect(signature).toContain("p_idempotency_key uuid");
  });

  it("derives the actor from auth.uid(), never a parameter, and authorizes against real org membership before creating anything", () => {
    const start = programSql.indexOf("function public.create_program(");
    const bodyEnd = programSql.indexOf("\n$$;", start);
    const body = programSql.slice(start, bodyEnd);
    expect(body).toContain("actor uuid := auth.uid()");
    expect(body).toMatch(/private\.has_org_role\(target_org_id, array\['owner', 'security_admin'\]/);
  });

  it("assigns the creator as a program_members manager and writes program.created, all inside the same function as the insert", () => {
    const start = programSql.indexOf("function public.create_program(");
    const bodyEnd = programSql.indexOf("\n$$;", start);
    const body = programSql.slice(start, bodyEnd);
    expect(body).toMatch(/insert into public\.program_members[\s\S]*?'manager'/);
    expect(body).toContain("'program.created'");
  });

  it("is granted to authenticated only, never anon or public", () => {
    expect(programSql).toMatch(/revoke all on function public\.create_program\([^;]*from public;/);
    expect(programSql).toMatch(/grant execute on function public\.create_program\([^;]*to authenticated;/);
    expect(programSql).not.toMatch(/grant execute on function public\.create_program\([^;]*to anon/);
  });
});

describe("migration source: private.is_program_member follows the same non-exposed-helper pattern as private.is_org_member", () => {
  it("is defined in private, not public, and never referenced unqualified", () => {
    expect(programSql).toContain("create or replace function private.is_program_member(");
    expect(programSql).not.toContain("create or replace function public.is_program_member(");
  });

  it("is stable, security definer, and pins search_path to ''", () => {
    const start = programSql.indexOf("create or replace function private.is_program_member(");
    const bodyEnd = programSql.indexOf("\n$$;", start);
    const signatureBlock = programSql.slice(start, bodyEnd);
    expect(signatureBlock).toMatch(/language plpgsql stable security definer set search_path = ''/);
  });

  it("grants execute to authenticated only", () => {
    expect(programSql).toMatch(/grant execute on function private\.is_program_member\(uuid\) to authenticated;/);
    expect(programSql).not.toMatch(/grant execute on function private\.is_program_member\(uuid\) to (anon|public)\b/i);
  });
});

describe("migration source: programs/program_members RLS ties access to org oversight or program membership, never a bare organization_id", () => {
  it("programs SELECT policy checks has_org_role or is_program_member", () => {
    expect(programSql).toMatch(/create policy "programs read by org admins or program members" on public\.programs[\s\S]*?using \(\s*private\.has_org_role\(organization_id, array\['owner', 'security_admin'\][\s\S]*?or private\.is_program_member\(id\)/);
  });

  it("program_members SELECT policy checks the caller's own row or org oversight, not an unscoped read", () => {
    expect(programSql).toMatch(/create policy "program members read own row or org admins" on public\.program_members[\s\S]*?using \(\s*user_id = auth\.uid\(\)\s*or private\.has_org_role\(organization_id/);
  });

  it("neither table has an insert/update/delete policy -- every write goes through create_program", () => {
    expect(programSql).not.toMatch(/create policy[^;]*on public\.programs\s+for (insert|update|delete)/);
    expect(programSql).not.toMatch(/create policy[^;]*on public\.program_members\s+for (insert|update|delete)/);
  });
});

describe("migration source: a program can never disagree with its own organization", () => {
  it("adds a composite unique constraint on programs(id, organization_id) and a matching composite FK from program_members", () => {
    expect(programSql).toMatch(/constraint programs_id_organization_id_key unique \(id, organization_id\)/);
    expect(programSql).toMatch(/foreign key \(program_id, organization_id\) references public\.programs\(id, organization_id\)/);
  });
});

describe("migration source: every SECURITY DEFINER function in the program-foundation migration pins search_path to ''", () => {
  const codeOnly = programSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("has a matching search_path='' for each `security definer` occurrence in code", () => {
    const definerCount = (codeOnly.match(/security definer/gi) ?? []).length;
    const pinnedCount = (codeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    expect(definerCount).toBeGreaterThan(0);
    expect(pinnedCount).toBe(definerCount);
  });
});

describe("migration source: the idempotency key is a real per-(organization, creator) unique constraint", () => {
  it("adds programs_org_created_by_idempotency_key_idx", () => {
    expect(programSql).toMatch(/create unique index programs_org_created_by_idempotency_key_idx on public\.programs\(organization_id, created_by, idempotency_key\) where idempotency_key is not null;/);
  });
});

describe("migration source: programs are always created at 'draft', never a client-controlled status", () => {
  it("create_program's insert hardcodes status = 'draft', and program_status is never a function parameter", () => {
    const start = programSql.indexOf("function public.create_program(");
    const signatureEnd = programSql.indexOf(")", start);
    const bodyEnd = programSql.indexOf("\n$$;", start);
    const signature = programSql.slice(start, signatureEnd);
    const body = programSql.slice(start, bodyEnd);
    expect(signature).not.toContain("status");
    expect(body).toMatch(/insert into public\.programs[\s\S]*?'draft'/);
  });
});

describe("migration source: scope mutation RPCs never trust a client-supplied actor/authorization", () => {
  for (const fn of ["add_scope_entry", "update_scope_entry", "remove_scope_entry", "evaluate_program_scope"]) {
    it(`${fn} has no actor_id/created_by/caller_id-trusting parameter`, () => {
      const start = scopeSql.indexOf(`function public.${fn}(`);
      expect(start, `${fn} should be defined in public`).toBeGreaterThan(-1);
      const returnsIdx = scopeSql.indexOf("returns", start);
      const signature = scopeSql.slice(start, returnsIdx);
      expect(signature).not.toMatch(/actor_id|created_by|caller_id/);
    });

    it(`${fn} derives the actor from auth.uid(), never a parameter`, () => {
      const start = scopeSql.indexOf(`function public.${fn}(`);
      const bodyEnd = scopeSql.indexOf("\n$$;", start);
      const body = scopeSql.slice(start, bodyEnd);
      expect(body).toContain("actor uuid := auth.uid()");
    });

    it(`${fn} is granted to authenticated and revoked from public, never granted to anon`, () => {
      expect(scopeSql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^;]*from public;`));
      expect(scopeSql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to authenticated;`));
      expect(scopeSql).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to anon`));
    });
  }

  for (const fn of ["add_scope_entry", "update_scope_entry", "remove_scope_entry"]) {
    it(`${fn} authorizes via the same two-path check as program access (has_org_role or is_program_member)`, () => {
      const start = scopeSql.indexOf(`function public.${fn}(`);
      const bodyEnd = scopeSql.indexOf("\n$$;", start);
      const body = scopeSql.slice(start, bodyEnd);
      expect(body).toMatch(/private\.has_org_role\(program\.organization_id, array\['owner', 'security_admin'\]/);
      expect(body).toMatch(/private\.is_program_member\(program\.id\)/);
    });
  }

  // The draft-only lock these three RPCs originally shipped with (asserted against this
  // same foundational migration file in earlier revisions of this test) was deliberately
  // removed in 202609230001_scope_editable_after_launch: an org can now fix scope mistakes
  // or retire/add targets after review/launch, since reports snapshot the scope state they
  // matched at submission time and are never retroactively affected by a later edit. The
  // current, live function bodies live in that later migration, not this one -- checked
  // below against ITS source, not this file's now-superseded original definitions.
  for (const fn of ["add_scope_entry", "update_scope_entry", "remove_scope_entry"]) {
    it(`${fn}'s original draft-only lock is documented as superseded, not silently dropped`, () => {
      const start = scopeSql.indexOf(`function public.${fn}(`);
      const bodyEnd = scopeSql.indexOf("\n$$;", start);
      const body = scopeSql.slice(start, bodyEnd);
      expect(body).toMatch(/program\.status <> 'draft'/);
      expect(body).toContain("SCOPE_LOCKED");
    });
  }
});

describe("migration source: scope mutation is no longer locked to draft (202609230001)", () => {
  const scopeEditableMigrationPath = `${repoRoot}db/migrations/202609230001_scope_editable_after_launch.sql`;
  const scopeEditableSql = readFileSync(scopeEditableMigrationPath, "utf8");

  for (const fn of ["add_scope_entry", "update_scope_entry", "remove_scope_entry"]) {
    it(`${fn} no longer checks program.status before mutating scope`, () => {
      const start = scopeEditableSql.indexOf(`function public.${fn}(`);
      const bodyEnd = scopeEditableSql.indexOf("\n$$;", start);
      const body = scopeEditableSql.slice(start, bodyEnd);
      expect(body).not.toMatch(/program\.status <> 'draft'/);
      expect(body).not.toContain("SCOPE_LOCKED");
    });

    it(`${fn} still authorizes via the same two-path check (has_org_role or is_program_member)`, () => {
      const start = scopeEditableSql.indexOf(`function public.${fn}(`);
      const bodyEnd = scopeEditableSql.indexOf("\n$$;", start);
      const body = scopeEditableSql.slice(start, bodyEnd);
      expect(body).toMatch(/private\.has_org_role\(program\.organization_id, array\['owner', 'security_admin'\]/);
      expect(body).toMatch(/private\.is_program_member\(program\.id\)/);
    });

    it(`${fn} still derives the actor from auth.uid(), never a parameter`, () => {
      const start = scopeEditableSql.indexOf(`function public.${fn}(`);
      const bodyEnd = scopeEditableSql.indexOf("\n$$;", start);
      const body = scopeEditableSql.slice(start, bodyEnd);
      expect(body).toContain("actor uuid := auth.uid()");
    });
  }

  // Regression guard for a real bug found live-testing this migration against Postgres:
  // update_scope_entry's predecessor (202609090009) referenced `canon.*` inside a single
  // UPDATE's `case when target_changed then canon.x else x end` expressions -- but Postgres
  // evaluates a record variable's field reference in every branch regardless of which one
  // is taken, so calling update_scope_entry WITHOUT target_input (the common "just change
  // scope_state" path, and the only one the UI's edit dialog drives) threw `record "canon"
  // is not assigned yet` and failed outright, on every program regardless of lifecycle
  // status. Fixed here via two separate UPDATE statements. A static check can't prove the
  // runtime behavior (that needs a real Postgres instance, exercised live during this
  // migration's own verification), but it can catch the exact anti-pattern regressing.
  it("update_scope_entry never references canon.* inside a single UPDATE's conditional-expression columns (the exact pattern that broke the no-target-change path)", () => {
    const start = scopeEditableSql.indexOf("function public.update_scope_entry(");
    const bodyEnd = scopeEditableSql.indexOf("\n$$;", start);
    const body = scopeEditableSql.slice(start, bodyEnd);
    expect(body).not.toMatch(/case when target_changed then canon\./);
  });
});

describe("migration source: canonicalization/validation exists in exactly one place", () => {
  it("private.canonicalize_scope_target is defined once, in private, not public", () => {
    expect(scopeSql).toContain("create or replace function private.canonicalize_scope_target(");
    expect(scopeSql).not.toContain("create or replace function public.canonicalize_scope_target(");
  });

  it("add_scope_entry and evaluate_program_scope both call the shared helper rather than reimplementing validation", () => {
    for (const fn of ["add_scope_entry", "evaluate_program_scope"]) {
      const start = scopeSql.indexOf(`function public.${fn}(`);
      const bodyEnd = scopeSql.indexOf("\n$$;", start);
      const body = scopeSql.slice(start, bodyEnd);
      expect(body).toContain("private.canonicalize_scope_target(p_asset_type, target_input)");
    }
  });

  it("uses out_*-prefixed local variables distinct from its own RETURNS TABLE column names, avoiding the 0003-class collision bug", () => {
    const start = scopeSql.indexOf("function private.canonicalize_scope_target(");
    const bodyEnd = scopeSql.indexOf("\n$$;", start);
    const body = scopeSql.slice(start, bodyEnd);
    expect(body).toMatch(/out_canonical|out_display|out_cidr/);
  });
});

describe("migration source: IP/CIDR uses Postgres's native network type, not string matching", () => {
  it("target_cidr is a real cidr column, and containment is checked with the native >>= operator", () => {
    expect(scopeSql).toMatch(/target_cidr cidr/);
    expect(scopeSql).toMatch(/e\.target_cidr >>= canon\.cidr_value/);
  });

  it("has a per-type check constraint tying target_cidr/url_origin/url_path to their asset_type", () => {
    expect(scopeSql).toMatch(/constraint program_scope_entries_cidr_check check \(\(asset_type = 'ip_cidr'\) = \(target_cidr is not null\)\)/);
    expect(scopeSql).toMatch(/constraint program_scope_entries_url_check check \(\(asset_type = 'url'\) = \(url_origin is not null and url_path is not null\)\)/);
  });
});

describe("migration source: scope entries are never physically deleted", () => {
  it("remove_scope_entry updates status to 'removed' rather than issuing a DELETE", () => {
    const start = scopeSql.indexOf("function public.remove_scope_entry(");
    const bodyEnd = scopeSql.indexOf("\n$$;", start);
    const body = scopeSql.slice(start, bodyEnd);
    expect(body).toMatch(/set status = 'removed', removed_at = now\(\), removed_by = actor/);
    expect(body).not.toMatch(/delete from public\.program_scope_entries/);
  });
});

describe("migration source: duplicate targets are prevented by a real database constraint", () => {
  it("adds a partial unique index on (program_id, asset_type, target) for active rows", () => {
    expect(scopeSql).toMatch(/create unique index program_scope_entries_unique_active_target on public\.program_scope_entries\(program_id, asset_type, target\) where status = 'active';/);
  });

  it("add_scope_entry catches unique_violation and raises DUPLICATE_TARGET rather than leaking the raw constraint error", () => {
    const start = scopeSql.indexOf("function public.add_scope_entry(");
    const bodyEnd = scopeSql.indexOf("\n$$;", start);
    const body = scopeSql.slice(start, bodyEnd);
    expect(body).toMatch(/exception when unique_violation then/);
    expect(body).toContain("DUPLICATE_TARGET");
  });
});

describe("migration source: a scope entry can never disagree with its program's organization", () => {
  it("adds organization_id plus a composite FK to programs(id, organization_id)", () => {
    expect(scopeSql).toMatch(/foreign key \(program_id, organization_id\) references public\.programs\(id, organization_id\)/);
  });
});

describe("migration source: every SECURITY DEFINER function in the scope-foundation migration pins search_path to ''", () => {
  const codeOnly = scopeSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("has a matching search_path='' for each `security definer` occurrence, and every function (definer or not) sets it", () => {
    const setCount = (codeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languagePlpgsqlCount = (codeOnly.match(/language plpgsql/g) ?? []).length;
    expect(setCount).toBe(languagePlpgsqlCount);
  });
});

describe("migration source: researcher access RPCs never trust a client-supplied actor/organization", () => {
  const MANAGER_RPCS = ["invite_researcher_to_program", "suspend_program_researcher", "reinstate_program_researcher", "revoke_program_researcher"];
  const ALL_RPCS = [...MANAGER_RPCS, "accept_program_invitation", "accept_program_invitation_by_id", "cancel_program_invitation", "list_my_pending_program_invitations", "list_my_program_participations"];

  for (const fn of ALL_RPCS) {
    it(`${fn} has no actor_id/caller_id-trusting parameter`, () => {
      const start = researcherSql.indexOf(`function public.${fn}(`);
      expect(start, `${fn} should be defined in public`).toBeGreaterThan(-1);
      const returnsIdx = researcherSql.indexOf("returns", start);
      const signature = researcherSql.slice(start, returnsIdx);
      expect(signature).not.toMatch(/actor_id|caller_id/);
    });

    it(`${fn} derives the actor from auth.uid(), never a parameter`, () => {
      const start = researcherSql.indexOf(`function public.${fn}(`);
      const bodyEnd = researcherSql.indexOf("\n$$;", start);
      const body = researcherSql.slice(start, bodyEnd);
      expect(body).toContain("actor uuid := auth.uid()");
    });

    it(`${fn} is granted to authenticated and revoked from public, never granted to anon`, () => {
      expect(researcherSql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^;]*from public;`));
      expect(researcherSql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to authenticated;`));
      expect(researcherSql).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to anon`));
    });
  }

  for (const fn of MANAGER_RPCS) {
    it(`${fn} authorizes via the same two-path check as every other program-management operation (has_org_role or is_program_member)`, () => {
      const start = researcherSql.indexOf(`function public.${fn}(`);
      const bodyEnd = researcherSql.indexOf("\n$$;", start);
      const body = researcherSql.slice(start, bodyEnd);
      expect(body).toMatch(/private\.has_org_role\(program\.organization_id, array\['owner', 'security_admin'\]/);
      expect(body).toMatch(/private\.is_program_member\(program\.id\)/);
    });

    it(`${fn} resolves the program from the database by id, never trusts a client-supplied organization_id`, () => {
      const start = researcherSql.indexOf(`function public.${fn}(`);
      const bodyEnd = researcherSql.indexOf("\n$$;", start);
      const body = researcherSql.slice(start, bodyEnd);
      expect(body).toMatch(/select \* into program from public\.programs where id = target_program_id;/);
    });
  }
});

describe("migration source: private.is_researcher_authorized_for_program follows the single-parameter, non-exposed helper pattern", () => {
  it("is defined in private, not public, and never referenced unqualified", () => {
    expect(researcherSql).toContain("create or replace function private.is_researcher_authorized_for_program(");
    expect(researcherSql).not.toContain("create or replace function public.is_researcher_authorized_for_program(");
  });

  it("takes only target_program_id -- never a researcherId/userId parameter that could turn it into an arbitrary-researcher oracle", () => {
    const start = researcherSql.indexOf("create or replace function private.is_researcher_authorized_for_program(");
    const signatureEnd = researcherSql.indexOf(")", start);
    const signature = researcherSql.slice(start, signatureEnd);
    expect(signature).toContain("target_program_id uuid");
    expect(signature).not.toMatch(/researcher_id|user_id|target_user_id/);
  });

  it("is stable, security definer, and pins search_path to ''", () => {
    const start = researcherSql.indexOf("create or replace function private.is_researcher_authorized_for_program(");
    const bodyEnd = researcherSql.indexOf("\n$$;", start);
    const signatureBlock = researcherSql.slice(start, bodyEnd);
    expect(signatureBlock).toMatch(/language plpgsql stable security definer set search_path = ''/);
  });

  it("grants execute to authenticated only", () => {
    expect(researcherSql).toMatch(/grant execute on function private\.is_researcher_authorized_for_program\(uuid\) to authenticated;/);
    expect(researcherSql).not.toMatch(/grant execute on function private\.is_researcher_authorized_for_program\(uuid\) to (anon|public)\b/i);
  });
});

describe("migration source: RLS widening -- an active researcher gains scoped read access, never a broader one", () => {
  it("programs SELECT policy adds the researcher path alongside the existing manager paths", () => {
    expect(researcherSql).toMatch(/create policy "programs read by org admins, program members, or authorized researchers" on public\.programs[\s\S]*?private\.is_researcher_authorized_for_program\(id\)/);
  });

  it("program_scope_entries SELECT policy scopes the researcher path to status = 'active' only, unlike the manager paths", () => {
    const start = researcherSql.indexOf('create policy "scope entries read by org admins, program members, or authorized researchers (active only)"');
    const end = researcherSql.indexOf(";", start);
    const policyBlock = researcherSql.slice(start, end);
    expect(policyBlock).toMatch(/private\.is_researcher_authorized_for_program\(program_id\) and status = 'active'/);
  });

  it("program_researchers has no policy granting a researcher visibility into other researchers' rows", () => {
    expect(researcherSql).toMatch(/create policy "program researchers read own row or managers" on public\.program_researchers[\s\S]*?using \(\s*user_id = auth\.uid\(\)/);
    expect(researcherSql).not.toMatch(/create policy[^;]*on public\.program_researchers[\s\S]*?using \(\s*true\s*\)/);
  });

  it("program_invitations has no researcher-facing read policy at all -- only org admins or program managers", () => {
    const start = researcherSql.indexOf('create policy "program invitations read by org admins or program managers" on public.program_invitations');
    expect(start).toBeGreaterThan(-1);
    const end = researcherSql.indexOf(";", start);
    const policyBlock = researcherSql.slice(start, end);
    expect(policyBlock).toMatch(/using \(\s*private\.has_org_role/);
    expect(policyBlock).not.toContain("is_researcher_authorized_for_program");
  });
});

describe("migration source: researcher participation state machine has no pending/invited status, mirroring organization_members", () => {
  it("program_researcher_status enum has exactly active/suspended/revoked", () => {
    expect(researcherSql).toMatch(/create type public\.program_researcher_status as enum \('active', 'suspended', 'revoked'\);/);
  });

  it("reinstate_program_researcher only transitions suspended -> active, never revoked -> active", () => {
    const start = researcherSql.indexOf("function public.reinstate_program_researcher(");
    const bodyEnd = researcherSql.indexOf("\n$$;", start);
    const body = researcherSql.slice(start, bodyEnd);
    expect(body).toMatch(/target\.status <> 'suspended'/);
    expect(body).toContain("RESEARCHER_NOT_SUSPENDED");
  });

  it("accept_program_invitation(_by_id) creates or reactivates the participation row directly at 'active', never a pending status", () => {
    for (const fn of ["accept_program_invitation", "accept_program_invitation_by_id"]) {
      const start = researcherSql.indexOf(`function public.${fn}(`);
      const bodyEnd = researcherSql.indexOf("\n$$;", start);
      const body = researcherSql.slice(start, bodyEnd);
      expect(body).toMatch(/on conflict \(program_id, user_id\) do update/);
      expect(body).toMatch(/status = 'active'/);
    }
  });
});

describe("migration source: no organization access is ever granted through researcher participation", () => {
  it("no researcher-management RPC writes to organization_members", () => {
    expect(researcherSql).not.toContain("insert into public.organization_members");
    expect(researcherSql).not.toContain("update public.organization_members");
  });
});

describe("migration source: submit_report never trusts a client-supplied actor/organization", () => {
  it("has no actor_id/researcher_id/organization_id-trusting parameter", () => {
    const start = reportSql.indexOf("function public.submit_report(");
    expect(start).toBeGreaterThan(-1);
    const returnsIdx = reportSql.indexOf("returns", start);
    const signature = reportSql.slice(start, returnsIdx);
    expect(signature).not.toMatch(/actor_id|researcher_id|organization_id|caller_id/);
  });

  it("derives the actor from auth.uid(), never a parameter", () => {
    const start = reportSql.indexOf("function public.submit_report(");
    const bodyEnd = reportSql.indexOf("\n$$;", start);
    const body = reportSql.slice(start, bodyEnd);
    expect(body).toContain("actor uuid := auth.uid()");
  });

  it("is granted to authenticated and revoked from public, never granted to anon", () => {
    expect(reportSql).toMatch(/revoke all on function public\.submit_report\([^;]*from public;/);
    expect(reportSql).toMatch(/grant execute on function public\.submit_report\([^;]*to authenticated;/);
    expect(reportSql).not.toMatch(/grant execute on function public\.submit_report\([^;]*to anon/);
  });
});

describe("migration source: submit_report composes existing primitives rather than reimplementing them", () => {
  const start = reportSql.indexOf("function public.submit_report(");
  const bodyEnd = reportSql.indexOf("\n$$;", start);
  const body = reportSql.slice(start, bodyEnd);

  it("authorizes via private.is_researcher_authorized_for_program, the same primitive researcher-facing reads use elsewhere", () => {
    expect(body).toMatch(/private\.is_researcher_authorized_for_program\(target_program_id\)/);
  });

  it("canonicalizes via the shared private.canonicalize_scope_target helper, not a second parser", () => {
    expect(body).toContain("private.canonicalize_scope_target(p_asset_type, target_input)");
  });

  it("matches scope via the shared private.match_program_scope helper, not reimplemented matching SQL", () => {
    expect(body).toMatch(/private\.match_program_scope\(target_program_id, p_asset_type, canon\.canonical, canon\.cidr_value, canon\.url_origin, canon\.url_path\)/);
    expect(body).not.toMatch(/left\(e\.target, 2\) = '\*\.'/); // the actual matching predicate lives only in private.match_program_scope
  });
});

describe("migration source: private.match_program_scope is the one deliberate non-self-authorizing private helper, and is documented as such", () => {
  it("is defined in private, not public", () => {
    expect(reportSql).toContain("create or replace function private.match_program_scope(");
    expect(reportSql).not.toContain("create or replace function public.match_program_scope(");
  });

  it("does not check auth.uid() -- unlike every self-authorizing private helper in this schema", () => {
    const start = reportSql.indexOf("create or replace function private.match_program_scope(");
    const bodyEnd = reportSql.indexOf("\n$$;", start);
    const body = reportSql.slice(start, bodyEnd);
    expect(body).not.toContain("auth.uid()");
  });

  it("its non-authorizing nature is documented in the migration's own comments", () => {
    expect(reportSql).toMatch(/NOT AUTHORIZING|NON-AUTHORIZING/i);
  });
});

describe("migration source: evaluate_program_scope was redefined to reuse the shared matcher, not duplicated", () => {
  it("still authorizes as a program manager (has_org_role or is_program_member), unchanged from 202608260005", () => {
    const start = reportSql.indexOf("function public.evaluate_program_scope(");
    expect(start, "evaluate_program_scope should be redefined in this migration").toBeGreaterThan(-1);
    const bodyEnd = reportSql.indexOf("\n$$;", start);
    const body = reportSql.slice(start, bodyEnd);
    expect(body).toMatch(/private\.has_org_role\(program\.organization_id, array\['owner', 'security_admin'\]/);
    expect(body).toMatch(/private\.is_program_member\(program\.id\)/);
    expect(body).toContain("private.match_program_scope(");
  });
});

describe("migration source: report submission enumeration safety", () => {
  it("uses an identical error for 'no scope match' and 'explicit out-of-scope match', never distinguishing them", () => {
    const start = reportSql.indexOf("function public.submit_report(");
    const bodyEnd = reportSql.indexOf("\n$$;", start);
    const body = reportSql.slice(start, bodyEnd);
    expect(body).toMatch(/match_result\.matched_entry_id is null or match_result\.matched_scope_state <> 'in_scope'/);
    const targetNotEligibleCount = (body.match(/TARGET_NOT_ELIGIBLE/g) ?? []).length;
    expect(targetNotEligibleCount).toBe(1); // one raise statement covers both rejection cases
  });
});

describe("migration source: report status starts at 'new' (DOMAIN.md's lifecycle), and no transition RPC exists in this slice", () => {
  it("report_status enum matches DOMAIN.md's full lifecycle", () => {
    expect(reportSql).toMatch(/create type public\.report_status as enum \('new', 'triaging', 'needs_information', 'accepted', 'resolved', 'duplicate', 'informative', 'not_applicable', 'rejected'\);/);
  });

  it("reports.status defaults to 'new'", () => {
    expect(reportSql).toMatch(/status public\.report_status not null default 'new'/);
  });

  it("no update-status RPC exists in this migration (triage is out of scope)", () => {
    expect(reportSql).not.toMatch(/function public\.(update|change|transition)_report_status/);
  });
});

describe("migration source: program lifecycle interaction -- blocked only when paused or closed", () => {
  it("submit_report rejects with SUBMISSIONS_CLOSED only for paused/closed, not draft/review/active", () => {
    const start = reportSql.indexOf("function public.submit_report(");
    const bodyEnd = reportSql.indexOf("\n$$;", start);
    const body = reportSql.slice(start, bodyEnd);
    expect(body).toMatch(/program\.status in \('paused', 'closed'\)/);
    expect(body).toContain("SUBMISSIONS_CLOSED");
  });
});

describe("migration source: scope snapshot is frozen at submission, both a reference and a decision snapshot", () => {
  it("reports stores matched_scope_entry_id (FK), matched_scope_state, and matched_target", () => {
    expect(reportSql).toMatch(/matched_scope_entry_id uuid references public\.program_scope_entries\(id\) on delete set null/);
    expect(reportSql).toMatch(/matched_scope_state public\.program_scope_state not null/);
    expect(reportSql).toMatch(/matched_target text not null/);
  });
});

describe("migration source: a report can never disagree with its program's organization", () => {
  it("adds organization_id plus a composite FK to programs(id, organization_id)", () => {
    expect(reportSql).toMatch(/foreign key \(program_id, organization_id\) references public\.programs\(id, organization_id\)/);
  });
});

describe("migration source: report confidentiality RLS -- researcher, org admins, or program managers only", () => {
  it("reports SELECT policy checks researcher_id = auth.uid(), has_org_role, or is_program_member", () => {
    const start = reportSql.indexOf('create policy "reports read by researcher, org admins, or program managers" on public.reports');
    expect(start).toBeGreaterThan(-1);
    const end = reportSql.indexOf(";", start);
    const policyBlock = reportSql.slice(start, end);
    expect(policyBlock).toMatch(/researcher_id = auth\.uid\(\)/);
    expect(policyBlock).toMatch(/private\.has_org_role/);
    expect(policyBlock).toMatch(/private\.is_program_member/);
  });

  it("has no insert/update/delete policy -- submit_report is the only writer", () => {
    expect(reportSql).not.toMatch(/create policy[^;]*on public\.reports\s+for (insert|update|delete)/);
  });
});

describe("migration source: list_my_reports is scoped to the caller's own reports only", () => {
  it("filters by researcher_id = actor, derived from auth.uid()", () => {
    const start = reportSql.indexOf("function public.list_my_reports(");
    const bodyEnd = reportSql.indexOf("\n$$;", start);
    const body = reportSql.slice(start, bodyEnd);
    expect(body).toContain("actor uuid := auth.uid()");
    expect(body).toMatch(/where r\.researcher_id = actor/);
  });
});

describe("migration source: every SECURITY DEFINER function in the report-foundation migration pins search_path to ''", () => {
  const codeOnly = reportSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("has a matching search_path='' for each `language plpgsql` occurrence", () => {
    const setCount = (codeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languagePlpgsqlCount = (codeOnly.match(/language plpgsql/g) ?? []).length;
    expect(setCount).toBe(languagePlpgsqlCount);
  });
});

// --- 202608270002_report_triage_foundation.sql -----------------------------------------

const triageMigrationPath = `${repoRoot}db/migrations/202608270002_report_triage_foundation.sql`;
const triageSql = readFileSync(triageMigrationPath, "utf8");

const TRIAGE_TRANSITION_RPCS = ["start_triage", "request_information", "accept_report", "mark_duplicate", "mark_informative", "mark_not_applicable", "reject_report", "resolve_report"];
const ALL_TRIAGE_RPCS = [...TRIAGE_TRANSITION_RPCS, "respond_to_information_request", "set_report_severity"];

describe("migration source: no generic status-update RPC exists", () => {
  it("defines no update/change/set/transition_report_status function", () => {
    expect(triageSql).not.toMatch(/function public\.(update|change|set|transition)_report_status\(/);
  });

  it("every triage RPC hardcodes its target status as a string literal, never accepts a report_status parameter", () => {
    for (const fn of TRIAGE_TRANSITION_RPCS) {
      const start = triageSql.indexOf(`function public.${fn}(`);
      expect(start, `${fn} should be defined in public`).toBeGreaterThan(-1);
      const signatureEnd = triageSql.indexOf("\nreturns", start);
      const signature = triageSql.slice(start, signatureEnd);
      expect(signature).not.toMatch(/public\.report_status/);
    }
  });
});

describe("migration source: DOMAIN.md's transition table is implemented once, as data", () => {
  it("private.report_status_transitions has exactly 21 rows, matching DOMAIN.md's lifecycle", () => {
    const start = triageSql.indexOf("insert into private.report_status_transitions");
    const end = triageSql.indexOf(";", start);
    const block = triageSql.slice(start, end);
    const rowCount = (block.match(/\('[a-z_]+', '[a-z_]+'\)/g) ?? []).length;
    expect(rowCount).toBe(21);
  });

  it("every transition RPC (except respond_to_information_request and set_report_severity) validates via private.is_valid_report_transition before mutating", () => {
    for (const fn of TRIAGE_TRANSITION_RPCS) {
      const start = triageSql.indexOf(`function public.${fn}(`);
      const bodyEnd = triageSql.indexOf("\n$$;", start);
      const body = triageSql.slice(start, bodyEnd);
      expect(body).toContain("private.is_valid_report_transition(report.status,");
    }
  });

  it("set_report_severity is orthogonal to the state machine -- it never calls is_valid_report_transition", () => {
    const start = triageSql.indexOf("function public.set_report_severity(");
    const bodyEnd = triageSql.indexOf("\n$$;", start);
    const body = triageSql.slice(start, bodyEnd);
    expect(body).not.toContain("is_valid_report_transition");
  });
});

describe("migration source: every INVALID_TRANSITION raise uses errcode 23514 (check_violation), not 55000 (regression: 55000 maps to HTTP 500 via PostgREST, not 400)", () => {
  it("has zero occurrences of errcode 55000 in this migration", () => {
    expect(triageSql).not.toMatch(/errcode = '55000'/);
  });

  it("every INVALID_TRANSITION raise is paired with errcode 23514 on the same statement", () => {
    const invalidTransitionCount = (triageSql.match(/'INVALID_TRANSITION:/g) ?? []).length;
    const pairedCount = (triageSql.match(/'INVALID_TRANSITION:[^']*' using errcode = '23514'/g) ?? []).length;
    expect(invalidTransitionCount).toBeGreaterThan(0);
    expect(pairedCount).toBe(invalidTransitionCount);
  });
});

describe("migration source: private.lock_and_authorize_report_for_triage locks the row and authorizes via the existing centralized capability model", () => {
  const start = triageSql.indexOf("create or replace function private.lock_and_authorize_report_for_triage(");
  const bodyEnd = triageSql.indexOf("\n$$;", start);
  const body = triageSql.slice(start, bodyEnd);

  it("is defined in private, not public", () => {
    expect(triageSql).toContain("create or replace function private.lock_and_authorize_report_for_triage(");
    expect(triageSql).not.toContain("create or replace function public.lock_and_authorize_report_for_triage(");
  });

  it("uses SELECT ... FOR UPDATE, not a plain SELECT, so concurrent transitions serialize on the row", () => {
    expect(body).toMatch(/select \* into report from public\.reports where id = target_report_id for update;/);
  });

  it("authorizes via the same two-path check as every other program-management operation (has_org_role or is_program_member)", () => {
    expect(body).toMatch(/private\.has_org_role\(report\.organization_id, array\['owner', 'security_admin'\]/);
    expect(body).toMatch(/private\.is_program_member\(report\.program_id\)/);
  });

  it("every manager-facing transition RPC calls it, rather than reimplementing lock/authorize inline", () => {
    for (const fn of TRIAGE_TRANSITION_RPCS) {
      const fnStart = triageSql.indexOf(`function public.${fn}(`);
      const fnBodyEnd = triageSql.indexOf("\n$$;", fnStart);
      const fnBody = triageSql.slice(fnStart, fnBodyEnd);
      expect(fnBody).toContain("private.lock_and_authorize_report_for_triage(target_report_id)");
    }
    const severityStart = triageSql.indexOf("function public.set_report_severity(");
    const severityBodyEnd = triageSql.indexOf("\n$$;", severityStart);
    expect(triageSql.slice(severityStart, severityBodyEnd)).toContain("private.lock_and_authorize_report_for_triage(target_report_id)");
  });
});

describe("migration source: respond_to_information_request is researcher-authorized, not manager-authorized", () => {
  const start = triageSql.indexOf("function public.respond_to_information_request(");
  const bodyEnd = triageSql.indexOf("\n$$;", start);
  const body = triageSql.slice(start, bodyEnd);

  it("does not call the manager-only lock_and_authorize_report_for_triage helper", () => {
    expect(body).not.toContain("lock_and_authorize_report_for_triage");
  });

  it("checks report.researcher_id = actor and private.is_researcher_authorized_for_program, the same shape submit_report uses", () => {
    expect(body).toMatch(/report\.researcher_id <> actor/);
    expect(body).toMatch(/private\.is_researcher_authorized_for_program\(report\.program_id\)/);
  });

  it("rejects unless the report is currently needs_information", () => {
    expect(body).toMatch(/report\.status <> 'needs_information'/);
  });

  it("never changes report.status -- responding is not itself a state transition", () => {
    expect(body).not.toMatch(/set status =/);
  });
});

describe("migration source: mark_duplicate enforces same-program boundary and rejects self-duplication with identical enumeration-safe messaging", () => {
  const start = triageSql.indexOf("function public.mark_duplicate(");
  const bodyEnd = triageSql.indexOf("\n$$;", start);
  const body = triageSql.slice(start, bodyEnd);

  it("rejects a report being marked as a duplicate of itself", () => {
    expect(body).toMatch(/p_duplicate_of_report_id = target_report_id/);
  });

  it("rejects a duplicate target that does not exist or belongs to a different program, via one shared check", () => {
    expect(body).toMatch(/duplicate_target\.id is null or duplicate_target\.program_id <> report\.program_id/);
  });

  it("uses exactly one INVALID_DUPLICATE_TARGET message for the nonexistent/wrong-program case (enumeration safety)", () => {
    const targetCount = (body.match(/INVALID_DUPLICATE_TARGET/g) ?? []).length;
    expect(targetCount).toBe(2); // self-dup (its own message) + the shared nonexistent/wrong-program message
  });
});

describe("migration source: transitions requiring structured data validate it in the database, not only the UI", () => {
  it("request_information rejects an empty or over-length reason", () => {
    const start = triageSql.indexOf("function public.request_information(");
    const bodyEnd = triageSql.indexOf("\n$$;", start);
    const body = triageSql.slice(start, bodyEnd);
    expect(body).toContain("INVALID_REASON");
    expect(body).toMatch(/char_length\(trimmed_reason\) > 2000/);
  });

  it("resolve_report rejects an empty or over-length resolution summary", () => {
    const start = triageSql.indexOf("function public.resolve_report(");
    const bodyEnd = triageSql.indexOf("\n$$;", start);
    const body = triageSql.slice(start, bodyEnd);
    expect(body).toContain("INVALID_RESOLUTION");
    expect(body).toMatch(/char_length\(trimmed_summary\) > 5000/);
  });

  it("respond_to_information_request rejects an empty or over-length response", () => {
    const start = triageSql.indexOf("function public.respond_to_information_request(");
    const bodyEnd = triageSql.indexOf("\n$$;", start);
    const body = triageSql.slice(start, bodyEnd);
    expect(body).toContain("INVALID_RESPONSE");
    expect(body).toMatch(/char_length\(trimmed_response\) > 5000/);
  });
});

describe("migration source: every successful transition writes exactly one audit_logs row, in the same transaction as the mutation", () => {
  it("has exactly one insert-into-audit_logs per triage RPC (10 RPCs, 10 inserts)", () => {
    const insertCount = (triageSql.match(/insert into public\.audit_logs \(actor_id, organization_id, action, entity_type, entity_id, metadata\)/g) ?? []).length;
    expect(insertCount).toBe(ALL_TRIAGE_RPCS.length);
  });

  it("every audit action name is namespaced report.*", () => {
    const actions = [...triageSql.matchAll(/values \(actor, report\.organization_id, '(report\.[a-z_]+)'/g)].map((m) => m[1]);
    expect(actions.length).toBe(ALL_TRIAGE_RPCS.length);
    expect(actions.every((action) => action.startsWith("report."))).toBe(true);
  });
});

describe("migration source: no dedicated report-history/assignment table -- audit_logs plus current-state columns are the whole model", () => {
  it("creates no report_history, report_assignments, or generic metadata escape-hatch table", () => {
    expect(triageSql).not.toMatch(/create table (public|private)\.report_history/);
    expect(triageSql).not.toMatch(/create table (public|private)\.report_assignments/);
    expect(triageSql).not.toMatch(/create table (public|private)\.report_triage_decisions/);
  });

  it("adds real typed columns for current-state fields, not a jsonb metadata column on reports", () => {
    expect(triageSql).toMatch(/add column confirmed_severity public\.report_severity/);
    expect(triageSql).toMatch(/add column duplicate_of_report_id uuid references public\.reports\(id\)/);
    expect(triageSql).toMatch(/add column information_request_reason text/);
    expect(triageSql).toMatch(/add column researcher_response text/);
    expect(triageSql).toMatch(/add column resolution_summary text/);
    expect(triageSql).not.toMatch(/add column metadata jsonb/);
  });
});

describe("migration source: a report can never be marked a duplicate of itself at the schema level", () => {
  it("adds a check constraint, defense in depth beyond the RPC-level check", () => {
    expect(triageSql).toMatch(/add constraint reports_duplicate_not_self_check check \(duplicate_of_report_id is null or duplicate_of_report_id <> id\)/);
  });
});

describe("migration source: private.report_status_transitions is deny-all at the RLS layer (defense in depth)", () => {
  it("enables RLS with no select/insert/update/delete policy defined anywhere in the file", () => {
    expect(triageSql).toMatch(/alter table private\.report_status_transitions enable row level security;/);
    expect(triageSql).not.toMatch(/create policy[^;]*on private\.report_status_transitions/);
  });
});

describe("migration source: every triage RPC never trusts a client-supplied actor, and is granted correctly", () => {
  for (const fn of ALL_TRIAGE_RPCS) {
    it(`${fn} has no actor_id/caller_id-trusting parameter`, () => {
      const start = triageSql.indexOf(`function public.${fn}(`);
      expect(start, `${fn} should be defined in public`).toBeGreaterThan(-1);
      const returnsIdx = triageSql.indexOf("\nreturns", start);
      const signature = triageSql.slice(start, returnsIdx);
      expect(signature).not.toMatch(/actor_id|caller_id/);
    });

    it(`${fn} derives the actor from auth.uid(), never a parameter`, () => {
      const start = triageSql.indexOf(`function public.${fn}(`);
      const bodyEnd = triageSql.indexOf("\n$$;", start);
      const body = triageSql.slice(start, bodyEnd);
      expect(body).toContain("actor uuid := auth.uid()");
    });

    it(`${fn} is granted to authenticated and revoked from public, never granted to anon`, () => {
      expect(triageSql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^;]*from public;`));
      expect(triageSql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to authenticated;`));
      expect(triageSql).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to anon`));
    });
  }
});

describe("migration source: every SECURITY DEFINER function in the report-triage-foundation migration pins search_path to ''", () => {
  const codeOnly = triageSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("has a matching search_path='' for each `language plpgsql` occurrence", () => {
    const setCount = (codeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languagePlpgsqlCount = (codeOnly.match(/language plpgsql/g) ?? []).length;
    expect(setCount).toBe(languagePlpgsqlCount);
  });
});

describe("migration source: triage is not gated by program lifecycle, unlike submission", () => {
  it("no triage RPC in this migration checks program.status", () => {
    for (const fn of ALL_TRIAGE_RPCS) {
      const start = triageSql.indexOf(`function public.${fn}(`);
      const bodyEnd = triageSql.indexOf("\n$$;", start);
      const body = triageSql.slice(start, bodyEnd);
      expect(body).not.toMatch(/program\.status/);
    }
  });
});

// --- 202608270003_report_evidence_and_communication.sql --------------------------------

const evidenceMigrationPath = `${repoRoot}db/migrations/202608270003_report_evidence_and_communication.sql`;
const evidenceSql = readFileSync(evidenceMigrationPath, "utf8");

const RESEARCHER_COMMUNICATION_RPCS = ["post_researcher_message", "add_researcher_evidence"];
const ORGANIZATION_COMMUNICATION_RPCS = ["post_organization_message", "add_organization_evidence"];
const ALL_COMMUNICATION_RPCS = [...RESEARCHER_COMMUNICATION_RPCS, ...ORGANIZATION_COMMUNICATION_RPCS];

describe("migration source: no generic comments table -- communication and evidence are two distinct tables", () => {
  it("creates report_messages and report_evidence, never a generic 'comments'/'report_comments' table", () => {
    expect(evidenceSql).toContain("create table public.report_messages (");
    expect(evidenceSql).toContain("create table public.report_evidence (");
    expect(evidenceSql).not.toMatch(/create table public\.(comments|report_comments)\b/);
  });

  it("visibility is a real two-value enum, not a boolean or free text", () => {
    expect(evidenceSql).toMatch(/create type public\.report_visibility as enum \('researcher_visible', 'internal'\);/);
  });

  it("evidence_type is a real enum restricted to non-binary types -- no 'file'/'screenshot' value exists yet", () => {
    expect(evidenceSql).toMatch(/create type public\.report_evidence_type as enum \('text', 'code', 'url', 'log'\);/);
  });

  it("both tables tie to their report via a real composite foreign key, never a bare report_id", () => {
    expect(evidenceSql).toMatch(/foreign key \(report_id, program_id, organization_id\) references public\.reports\(id, program_id, organization_id\) on delete cascade/g);
    const fkCount = (evidenceSql.match(/foreign key \(report_id, program_id, organization_id\) references public\.reports\(id, program_id, organization_id\)/g) ?? []).length;
    expect(fkCount).toBe(2);
  });

  it("neither table has a generic jsonb metadata escape hatch -- core fields are typed columns", () => {
    expect(evidenceSql).not.toMatch(/create table public\.report_(messages|evidence\b)[\s\S]{0,600}metadata jsonb/);
  });
});

describe("migration source: author_context is always derived server-side, never a client-supplied parameter", () => {
  for (const fn of ALL_COMMUNICATION_RPCS) {
    it(`${fn} has no author_id/author_context/actor_id-trusting parameter`, () => {
      const start = evidenceSql.indexOf(`function public.${fn}(`);
      expect(start, `${fn} should be defined in public`).toBeGreaterThan(-1);
      const signatureEnd = evidenceSql.indexOf("\nreturns", start);
      const signature = evidenceSql.slice(start, signatureEnd);
      expect(signature).not.toMatch(/author_id|author_context|actor_id|caller_id/);
    });
  }

  it("researcher-authorized RPCs hardcode author_context='researcher' and visibility='researcher_visible' as literals, never a variable sourced from client input", () => {
    for (const fn of RESEARCHER_COMMUNICATION_RPCS) {
      const start = evidenceSql.indexOf(`function public.${fn}(`);
      const bodyEnd = evidenceSql.indexOf("\n$$;", start);
      const body = evidenceSql.slice(start, bodyEnd);
      expect(body).toMatch(/'researcher', 'researcher_visible'/);
    }
  });

  it("organization-authorized RPCs hardcode author_context='organization', but accept p_visibility as a real constrained enum parameter", () => {
    for (const fn of ORGANIZATION_COMMUNICATION_RPCS) {
      const start = evidenceSql.indexOf(`function public.${fn}(`);
      const signatureEnd = evidenceSql.indexOf("\nreturns", start);
      const bodyEnd = evidenceSql.indexOf("\n$$;", start);
      const signature = evidenceSql.slice(start, signatureEnd);
      const body = evidenceSql.slice(start, bodyEnd);
      expect(signature).toContain("p_visibility public.report_visibility");
      expect(body).toMatch(/'organization', p_visibility/);
    }
  });
});

describe("migration source: two authorization paths, reusing the existing capability model", () => {
  it("researcher-authorized RPCs check researcher_id = actor and is_researcher_authorized_for_program, the same shape submit_report uses", () => {
    for (const fn of RESEARCHER_COMMUNICATION_RPCS) {
      const start = evidenceSql.indexOf(`function public.${fn}(`);
      const bodyEnd = evidenceSql.indexOf("\n$$;", start);
      const body = evidenceSql.slice(start, bodyEnd);
      expect(body).toMatch(/report\.researcher_id <> actor/);
      expect(body).toMatch(/private\.is_researcher_authorized_for_program\(report\.program_id\)/);
    }
  });

  it("organization-authorized RPCs call private.authorize_report_for_communication, not the manager helper reimplemented inline", () => {
    for (const fn of ORGANIZATION_COMMUNICATION_RPCS) {
      const start = evidenceSql.indexOf(`function public.${fn}(`);
      const bodyEnd = evidenceSql.indexOf("\n$$;", start);
      const body = evidenceSql.slice(start, bodyEnd);
      expect(body).toContain("private.authorize_report_for_communication(target_report_id)");
    }
  });
});

describe("migration source: private.authorize_report_for_communication is a non-locking sibling of 0009's helper, not a reuse of it", () => {
  const start = evidenceSql.indexOf("create or replace function private.authorize_report_for_communication(");
  const bodyEnd = evidenceSql.indexOf("\n$$;", start);
  const body = evidenceSql.slice(start, bodyEnd);

  it("is defined in private, not public", () => {
    expect(evidenceSql).toContain("create or replace function private.authorize_report_for_communication(");
    expect(evidenceSql).not.toContain("create or replace function public.authorize_report_for_communication(");
  });

  it("uses a plain SELECT, never FOR UPDATE -- appends do not need the row lock 0009's transition helper takes", () => {
    expect(body).toMatch(/select \* into report from public\.reports where id = target_report_id;/);
    expect(body).not.toMatch(/for update/);
  });

  it("authorizes via the identical two-path check as every other program-management operation", () => {
    expect(body).toMatch(/private\.has_org_role\(report\.organization_id, array\['owner', 'security_admin'\]/);
    expect(body).toMatch(/private\.is_program_member\(report\.program_id\)/);
  });

  it("this migration never edits 0009's own private.lock_and_authorize_report_for_triage definition", () => {
    expect(evidenceSql).not.toContain("create or replace function private.lock_and_authorize_report_for_triage(");
  });
});

describe("migration source: private.insert_report_message / private.insert_report_evidence are shared, non-authorizing insert primitives", () => {
  it("are defined in private, not public, and reject empty or over-length content", () => {
    expect(evidenceSql).toContain("create or replace function private.insert_report_message(");
    expect(evidenceSql).toContain("create or replace function private.insert_report_evidence(");
    expect(evidenceSql).not.toContain("create or replace function public.insert_report_message(");
    expect(evidenceSql).not.toContain("create or replace function public.insert_report_evidence(");
    expect(evidenceSql).toContain("INVALID_MESSAGE");
    expect(evidenceSql).toContain("INVALID_EVIDENCE");
  });

  it("every public communication/evidence RPC calls the shared insert primitive rather than inserting directly", () => {
    for (const fn of ALL_COMMUNICATION_RPCS) {
      const start = evidenceSql.indexOf(`function public.${fn}(`);
      const bodyEnd = evidenceSql.indexOf("\n$$;", start);
      const body = evidenceSql.slice(start, bodyEnd);
      expect(body).toMatch(/private\.(insert_report_message|insert_report_evidence)\(/);
    }
  });
});

describe("migration source: information_request_reason/researcher_response are dropped, superseded by report_messages", () => {
  it("drops both columns from reports", () => {
    expect(evidenceSql).toMatch(/drop column information_request_reason/);
    expect(evidenceSql).toMatch(/drop column researcher_response/);
  });

  it("does not drop resolution_summary -- that stays current-state triage data, not communication", () => {
    expect(evidenceSql).not.toMatch(/drop column resolution_summary/);
  });

  it("respond_to_information_request is dropped", () => {
    expect(evidenceSql).toMatch(/drop function if exists public\.respond_to_information_request\(uuid, text\);/);
  });

  it("request_information is redefined here (not left untouched) to write a message instead of the dropped column", () => {
    const start = evidenceSql.indexOf("create or replace function public.request_information(");
    expect(start).toBeGreaterThan(-1);
    const bodyEnd = evidenceSql.indexOf("\n$$;", start);
    const body = evidenceSql.slice(start, bodyEnd);
    expect(body).not.toContain("information_request_reason");
    expect(body).toContain("private.insert_report_message(report, 'organization', 'researcher_visible', p_reason)");
  });

  it("request_information still uses 0009's lock_and_authorize_report_for_triage and still writes exactly one report.information_requested audit event", () => {
    const start = evidenceSql.indexOf("create or replace function public.request_information(");
    const bodyEnd = evidenceSql.indexOf("\n$$;", start);
    const body = evidenceSql.slice(start, bodyEnd);
    expect(body).toContain("private.lock_and_authorize_report_for_triage(target_report_id)");
    const auditCount = (body.match(/insert into public\.audit_logs/g) ?? []).length;
    expect(auditCount).toBe(1);
    expect(body).toContain("'report.information_requested'");
  });
});

describe("migration source: no hidden coupling between communication/evidence and report state", () => {
  it("post_researcher_message, post_organization_message, add_researcher_evidence, and add_organization_evidence never write reports.status", () => {
    for (const fn of ALL_COMMUNICATION_RPCS) {
      const start = evidenceSql.indexOf(`function public.${fn}(`);
      const bodyEnd = evidenceSql.indexOf("\n$$;", start);
      const body = evidenceSql.slice(start, bodyEnd);
      expect(body).not.toMatch(/set status =/);
    }
  });
});

describe("migration source: report_messages/report_evidence are append-only -- no update/delete RPC, no such RLS grant", () => {
  it("defines no update/delete/remove/retract function for either table", () => {
    expect(evidenceSql).not.toMatch(/function public\.(update|delete|remove|retract|edit)_(report_)?(message|evidence)/i);
  });

  it("has no insert/update/delete policy on either table -- select is the only policy", () => {
    expect(evidenceSql).not.toMatch(/create policy[^;]*on public\.report_messages\s+for (insert|update|delete)/);
    expect(evidenceSql).not.toMatch(/create policy[^;]*on public\.report_evidence\s+for (insert|update|delete)/);
  });

  it("grants only select to authenticated on both tables -- insert/update/delete are service_role only, matching every other table in this schema", () => {
    expect(evidenceSql).toMatch(/grant select on public\.report_messages, public\.report_evidence to authenticated;/);
    expect(evidenceSql).not.toMatch(/grant (insert|update|delete)[^;]*to authenticated/);
  });
});

describe("migration source: report_messages/report_evidence RLS -- visibility is its own axis, never inferred from report access alone", () => {
  it("both SELECT policies require researcher_visible AND own-report for the researcher path, plus org oversight or program membership", () => {
    for (const table of ["report_messages", "report_evidence"]) {
      const start = evidenceSql.indexOf(`on public.${table}\n  for select to authenticated`);
      expect(start, `${table} policy should exist`).toBeGreaterThan(-1);
      const end = evidenceSql.indexOf(");", start);
      const policyBlock = evidenceSql.slice(start, end);
      expect(policyBlock).toMatch(/visibility = 'researcher_visible' and researcher_id = auth\.uid\(\)/);
      expect(policyBlock).toMatch(/private\.has_org_role\(organization_id/);
      expect(policyBlock).toMatch(/private\.is_program_member\(program_id\)/);
    }
  });
});

describe("migration source: a proactively-closed public.users read gap -- researchers can now read a manager's/owner's profile", () => {
  it("adds a new users SELECT policy calling a dedicated, RLS-bypassing private helper -- not an inline exists() against program_members/organization_members", () => {
    const start = evidenceSql.indexOf('create policy "users read by researchers of a program the user manages or administers" on public.users');
    expect(start).toBeGreaterThan(-1);
    const end = evidenceSql.indexOf(";", start);
    const policyBlock = evidenceSql.slice(start, end);
    expect(policyBlock).toContain("using (private.is_manager_or_admin_of_my_program(id))");
  });

  it("private.is_manager_or_admin_of_my_program self-authorizes the caller via auth.uid(), bypasses program_members'/organization_members' own RLS, and is bounded to the caller's own actively-authorized programs (regression test for the RLS self-reference bug an inline exists() had)", () => {
    const start = evidenceSql.indexOf("create or replace function private.is_manager_or_admin_of_my_program(");
    expect(start).toBeGreaterThan(-1);
    const bodyEnd = evidenceSql.indexOf("\n$$;", start);
    const signatureBlock = evidenceSql.slice(start, evidenceSql.indexOf("\nas $$", start));
    const body = evidenceSql.slice(start, bodyEnd);
    expect(signatureBlock).toMatch(/language plpgsql stable security definer set search_path = ''/);
    expect(body).toContain("actor uuid := auth.uid()");
    expect(body).toMatch(/pr\.user_id = actor and pr\.status = 'active'/);
    expect(body).toMatch(/om\.role in \('owner', 'security_admin'\)/);
  });

  it("is granted to authenticated only, never anon or public (defense in depth even though it is never routed by PostgREST, being in the private schema)", () => {
    expect(evidenceSql).toMatch(/grant execute on function private\.is_manager_or_admin_of_my_program\(uuid\) to authenticated;/);
    expect(evidenceSql).not.toMatch(/grant execute on function private\.is_manager_or_admin_of_my_program\(uuid\) to (anon|public)\b/i);
  });
});

describe("migration source: every communication/evidence RPC is granted to authenticated only, never anon", () => {
  for (const fn of ["post_researcher_message", "post_organization_message", "add_researcher_evidence", "add_organization_evidence"]) {
    it(`${fn} has an explicit revoke-from-public / grant-to-authenticated pair`, () => {
      expect(evidenceSql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^;]*from public;`));
      expect(evidenceSql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to authenticated;`));
      expect(evidenceSql).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to anon`));
    });
  }
});

describe("migration source: every audit_logs insert uses entity_type='report' -- the existing getReportAuditActivity read path picks up these events with no service-layer change", () => {
  it("post_researcher_message/post_organization_message/add_researcher_evidence/add_organization_evidence each write exactly one audit row, entity_type='report'", () => {
    for (const fn of ALL_COMMUNICATION_RPCS) {
      const start = evidenceSql.indexOf(`function public.${fn}(`);
      const bodyEnd = evidenceSql.indexOf("\n$$;", start);
      const body = evidenceSql.slice(start, bodyEnd);
      const auditCount = (body.match(/insert into public\.audit_logs/g) ?? []).length;
      expect(auditCount).toBe(1);
      expect(body).toMatch(/'report',\s*target_report_id/);
    }
  });

  it("uses report.message_posted / report.evidence_added action names", () => {
    expect(evidenceSql).toContain("'report.message_posted'");
    expect(evidenceSql).toContain("'report.evidence_added'");
  });
});

describe("migration source: no binary/file evidence, no storage bucket, no attachment table", () => {
  it("does not create a storage bucket or attachment table", () => {
    expect(evidenceSql).not.toMatch(/storage\.buckets|create table public\.(attachments|report_attachments|report_files)/);
  });
});

describe("migration source: every SECURITY DEFINER function in the evidence-and-communication migration pins search_path to ''", () => {
  const codeOnly = evidenceSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("has a matching search_path='' for each `language plpgsql` occurrence", () => {
    const setCount = (codeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languagePlpgsqlCount = (codeOnly.match(/language plpgsql/g) ?? []).length;
    expect(setCount).toBe(languagePlpgsqlCount);
  });
});

// --- 202608270004_report_evidence_file_type.sql / 202608270005_binary_evidence_storage.sql

const evidenceEnumMigrationPath = `${repoRoot}db/migrations/202608270004_report_evidence_file_type.sql`;
const evidenceEnumSql = readFileSync(evidenceEnumMigrationPath, "utf8");
const binaryEvidenceMigrationPath = `${repoRoot}db/migrations/202608270005_binary_evidence_storage.sql`;
const binarySql = readFileSync(binaryEvidenceMigrationPath, "utf8");

const FILE_EVIDENCE_RPCS = ["add_researcher_file_evidence", "add_organization_file_evidence", "record_evidence_download"];

describe("migration source: report_evidence_type's 'file' value is added in its own migration, ahead of the constraints that reference it", () => {
  it("202608270004 adds exactly the 'file' enum value and nothing else", () => {
    expect(evidenceEnumSql).toMatch(/alter type public\.report_evidence_type add value 'file';/);
    expect(evidenceEnumSql).not.toMatch(/create (table|function)|alter table/);
  });

  it("202608270005 never re-adds the enum value (would fail -- the value must already be committed)", () => {
    expect(binarySql).not.toMatch(/add value 'file'/);
  });
});

describe("migration source: no generic file-upload implementation -- report_evidence gains a typed file shape, not a JSON blob or a new table", () => {
  it("does not create a report_files/report_attachments/attachments table", () => {
    expect(binarySql).not.toMatch(/create table public\.(report_files|report_attachments|attachments)\b/);
  });

  it("adds five typed nullable columns to report_evidence, not a jsonb metadata column", () => {
    expect(binarySql).toMatch(/add column object_key text/);
    expect(binarySql).toMatch(/add column original_filename text/);
    expect(binarySql).toMatch(/add column content_type text/);
    expect(binarySql).toMatch(/add column size_bytes bigint/);
    expect(binarySql).toMatch(/add column sha256 text/);
    expect(binarySql).not.toMatch(/add column metadata jsonb/);
  });

  it("makes content nullable (file rows carry no inline content)", () => {
    expect(binarySql).toMatch(/alter column content drop not null/);
  });
});

describe("migration source: a check constraint enforces exactly one shape per evidence_type, enforced by the database, not just application code", () => {
  it("report_evidence_file_shape_check requires file rows to have every file field and no content, and every other type to have content and no file fields", () => {
    const start = binarySql.indexOf("add constraint report_evidence_file_shape_check check (");
    expect(start).toBeGreaterThan(-1);
    const end = binarySql.indexOf("),", start);
    const constraintBody = binarySql.slice(start, end);
    expect(constraintBody).toMatch(/evidence_type = 'file' and object_key is not null and content is null/);
    expect(constraintBody).toMatch(/evidence_type <> 'file' and object_key is null and content is not null/);
  });

  it("object_key format is constrained to the exact 'evidence/<uuid>' shape at the schema level", () => {
    expect(binarySql).toMatch(/report_evidence_object_key_format_check check \(object_key is null or object_key ~ '\^evidence\/\[0-9a-f\]\{8\}-/);
  });

  it("size_bytes is constrained to (0, 10485760] -- the documented 10 MiB limit, not an arbitrary or unenforced number", () => {
    expect(binarySql).toMatch(/report_evidence_size_bytes_check check \(size_bytes is null or \(size_bytes > 0 and size_bytes <= 10485760\)\)/);
  });

  it("sha256 is constrained to a 64-character lowercase hex string", () => {
    expect(binarySql).toMatch(/report_evidence_sha256_format_check check \(sha256 is null or sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  });
});

describe("migration source: the evidence bucket is private, with a storage-layer size backstop", () => {
  it("adds no storage.objects RLS policy for authenticated or anon -- every access goes through the service-role client only, after Unpatched's own authorization", () => {
    expect(binarySql).not.toMatch(/create policy[^;]*on storage\.objects/);
  });
});

describe("migration source: private.insert_report_file_evidence validates server-side, independent of whatever the TypeScript layer already checked", () => {
  it("is defined in private, not public", () => {
    expect(binarySql).toContain("create or replace function private.insert_report_file_evidence(");
    expect(binarySql).not.toContain("create or replace function public.insert_report_file_evidence(");
  });

  it("rejects an empty/over-length filename, a non-positive or over-limit size, and a malformed hash", () => {
    const start = binarySql.indexOf("create or replace function private.insert_report_file_evidence(");
    const bodyEnd = binarySql.indexOf("\n$$;", start);
    const body = binarySql.slice(start, bodyEnd);
    expect(body).toContain("INVALID_EVIDENCE");
    expect(body).toMatch(/char_length\(trimmed_filename\) > 255/);
    expect(body).toMatch(/p_size_bytes > 10485760/);
    expect(body).toMatch(/p_sha256 !~ '\^\[0-9a-f\]\{64\}\$'/);
  });
});

describe("migration source: add_researcher_file_evidence / add_organization_file_evidence reuse the identical authorization shape as 0010's non-file evidence RPCs", () => {
  it("neither RPC has an author_id/author_context/actor_id/researcher_id-trusting parameter", () => {
    for (const fn of ["add_researcher_file_evidence", "add_organization_file_evidence"]) {
      const start = binarySql.indexOf(`function public.${fn}(`);
      expect(start, `${fn} should be defined in public`).toBeGreaterThan(-1);
      const signatureEnd = binarySql.indexOf("\nreturns", start);
      const signature = binarySql.slice(start, signatureEnd);
      expect(signature).not.toMatch(/author_id|author_context|actor_id|caller_id|researcher_id/);
    }
  });

  it("add_researcher_file_evidence checks researcher_id = actor and is_researcher_authorized_for_program", () => {
    const start = binarySql.indexOf("function public.add_researcher_file_evidence(");
    const bodyEnd = binarySql.indexOf("\n$$;", start);
    const body = binarySql.slice(start, bodyEnd);
    expect(body).toMatch(/report\.researcher_id <> actor/);
    expect(body).toMatch(/private\.is_researcher_authorized_for_program\(report\.program_id\)/);
  });

  it("add_organization_file_evidence calls private.authorize_report_for_communication, not a reimplemented check", () => {
    const start = binarySql.indexOf("function public.add_organization_file_evidence(");
    const bodyEnd = binarySql.indexOf("\n$$;", start);
    const body = binarySql.slice(start, bodyEnd);
    expect(body).toContain("private.authorize_report_for_communication(target_report_id)");
  });

  it("both call the shared private.insert_report_file_evidence primitive rather than inserting directly", () => {
    for (const fn of ["add_researcher_file_evidence", "add_organization_file_evidence"]) {
      const start = binarySql.indexOf(`function public.${fn}(`);
      const bodyEnd = binarySql.indexOf("\n$$;", start);
      const body = binarySql.slice(start, bodyEnd);
      expect(body).toContain("private.insert_report_file_evidence(");
    }
  });

  it("both write exactly one report.evidence_added audit event carrying evidence_type: file", () => {
    for (const fn of ["add_researcher_file_evidence", "add_organization_file_evidence"]) {
      const start = binarySql.indexOf(`function public.${fn}(`);
      const bodyEnd = binarySql.indexOf("\n$$;", start);
      const body = binarySql.slice(start, bodyEnd);
      const auditCount = (body.match(/insert into public\.audit_logs/g) ?? []).length;
      expect(auditCount).toBe(1);
      expect(body).toContain("'report.evidence_added'");
      expect(body).toMatch(/'evidence_type', 'file'/);
    }
  });
});

describe("migration source: record_evidence_download independently re-derives the visibility check, then audits -- defense in depth, not blind trust in a prior read", () => {
  const start = binarySql.indexOf("create or replace function public.record_evidence_download(");
  const bodyEnd = binarySql.indexOf("\n$$;", start);
  const body = binarySql.slice(start, bodyEnd);

  it("re-checks researcher_visible-and-own-report OR org oversight OR program membership, the identical predicate report_evidence's own RLS policy expresses", () => {
    expect(body).toMatch(/visibility = 'researcher_visible' and researcher_id = actor/);
    expect(body).toMatch(/private\.has_org_role\(organization_id, array\['owner', 'security_admin'\]/);
    expect(body).toMatch(/private\.is_program_member\(program_id\)/);
  });

  it("writes exactly one report.evidence_downloaded audit event, and never on a denied/nonexistent lookup", () => {
    const auditCount = (body.match(/insert into public\.audit_logs/g) ?? []).length;
    expect(auditCount).toBe(1);
    expect(body).toContain("'report.evidence_downloaded'");
    expect(body).toMatch(/if evidence\.id is null then raise exception 'EVIDENCE_NOT_FOUND/);
  });

  it("never logs file bytes or a signed URL, only the evidence id", () => {
    expect(body).toMatch(/jsonb_build_object\('evidence_id', evidence\.id\)/);
  });
});

describe("migration source: file evidence is append-only -- no update/delete/replace RPC exists for it either", () => {
  it("defines no update/delete/replace/retract function for report_evidence in this migration", () => {
    expect(binarySql).not.toMatch(/function public\.(update|delete|remove|retract|edit|replace)_(report_)?(file_)?evidence/i);
  });
});

describe("migration source: every file-evidence RPC is granted to authenticated only, never anon", () => {
  for (const fn of FILE_EVIDENCE_RPCS) {
    it(`${fn} has an explicit revoke-from-public / grant-to-authenticated pair`, () => {
      expect(binarySql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^;]*from public;`));
      expect(binarySql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to authenticated;`));
      expect(binarySql).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^;]*to anon`));
    });
  }
});

describe("migration source: every SECURITY DEFINER function in the binary-evidence-storage migration pins search_path to ''", () => {
  const codeOnly = binarySql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("has a matching search_path='' for each `language plpgsql` occurrence", () => {
    const setCount = (codeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languagePlpgsqlCount = (codeOnly.match(/language plpgsql/g) ?? []).length;
    expect(setCount).toBe(languagePlpgsqlCount);
  });
});

// --- 202608280001_report_resolution_finality.sql ----------------------------------------

const finalityMigrationPath = `${repoRoot}db/migrations/202608280001_report_resolution_finality.sql`;
const finalitySql = readFileSync(finalityMigrationPath, "utf8");
const bountyMigrationPath = `${repoRoot}db/migrations/202608280002_bounty_decision_engine.sql`;
const bountySql = readFileSync(bountyMigrationPath, "utf8");
const paymentMigrationPath = `${repoRoot}db/migrations/202608290001_payment_ledger_and_payout_orchestration.sql`;
const paymentSql = readFileSync(paymentMigrationPath, "utf8");
const outboxMigrationPath = `${repoRoot}db/migrations/202608290002_outbox_event_foundation.sql`;
const outboxSql = readFileSync(outboxMigrationPath, "utf8");
const outboxCodeOnly = outboxSql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
const reputationMigrationPath = `${repoRoot}db/migrations/202608290003_reputation_ledger_foundation.sql`;
const reputationSql = readFileSync(reputationMigrationPath, "utf8");
const reputationCodeOnly = reputationSql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("migration source: no new classification/resolution columns -- DOMAIN.md's terminal status values already are the classification, resolution_summary already answers resolution", () => {
  it("adds no classification/resolution_reason/resolution_type/resolution_metadata column anywhere in this migration", () => {
    expect(finalitySql).not.toMatch(/add column (classification|resolution_reason|resolution_type|resolution_metadata)/);
  });

  it("creates no new table for classification or resolution history", () => {
    expect(finalitySql).not.toMatch(/create table/);
  });
});

describe("migration source: set_report_severity is redefined (not duplicated) to add a generic, transition-table-driven finality check", () => {
  const start = finalitySql.indexOf("create or replace function public.set_report_severity(");
  const bodyEnd = finalitySql.indexOf("\n$$;", start);
  const body = finalitySql.slice(start, bodyEnd);

  it("is defined exactly once in this file", () => {
    expect(start).toBeGreaterThan(-1);
    const count = (finalitySql.match(/create or replace function public\.set_report_severity\(/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("checks finality generically against private.report_status_transitions, never a hardcoded list of terminal status literals", () => {
    expect(body).toMatch(/not exists \(select 1 from private\.report_status_transitions t where t\.from_status = report\.status\)/);
    expect(body).not.toMatch(/status (in|=) \('?(resolved|duplicate|informative|not_applicable|rejected)/);
  });

  it("raises SEVERITY_LOCKED with a check_violation errcode (maps to a clean 4xx, not a raw 500)", () => {
    expect(body).toContain("SEVERITY_LOCKED");
    expect(body).toMatch(/SEVERITY_LOCKED:[^']*' using errcode = '23514'/);
  });

  it("still uses the unchanged 0009 authorization helper and still writes exactly one audit event", () => {
    expect(body).toContain("private.lock_and_authorize_report_for_triage(target_report_id)");
    const auditCount = (body.match(/insert into public\.audit_logs/g) ?? []).length;
    expect(auditCount).toBe(1);
    expect(body).toContain("'report.severity_set'");
  });
});

describe("migration source: mark_duplicate is redefined (not duplicated) to lock the target row and reject a reciprocal duplicate relationship", () => {
  const start = finalitySql.indexOf("create or replace function public.mark_duplicate(");
  const bodyEnd = finalitySql.indexOf("\n$$;", start);
  const body = finalitySql.slice(start, bodyEnd);

  it("is defined exactly once in this file", () => {
    expect(start).toBeGreaterThan(-1);
    const count = (finalitySql.match(/create or replace function public\.mark_duplicate\(/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("locks the target report row (FOR UPDATE), not just the source row", () => {
    expect(body).toMatch(/select \* into duplicate_target from public\.reports where id = p_duplicate_of_report_id for update;/);
  });

  it("catches a genuine deadlock and re-maps it to a safe domain error, never leaking a raw Postgres deadlock error", () => {
    expect(body).toMatch(/exception\s+when deadlock_detected then/);
    expect(body).toMatch(/INVALID_DUPLICATE_TARGET:[^']*' using errcode = '22023';\s*end;/);
  });

  it("rejects a reciprocal duplicate relationship (target already recorded as a duplicate of the source)", () => {
    expect(body).toMatch(/if duplicate_target\.duplicate_of_report_id = target_report_id then/);
  });

  it("preserves every pre-existing 0009 check (self-duplication, same-program, transition validity) unchanged", () => {
    expect(body).toMatch(/p_duplicate_of_report_id = target_report_id/);
    expect(body).toMatch(/duplicate_target\.id is null or duplicate_target\.program_id <> report\.program_id/);
    expect(body).toContain("private.is_valid_report_transition(report.status, 'duplicate')");
  });

  it("still writes exactly one audit event on success", () => {
    const auditCount = (body.match(/insert into public\.audit_logs/g) ?? []).length;
    expect(auditCount).toBe(1);
    expect(body).toContain("'report.marked_duplicate'");
  });
});

describe("migration source: no reopen operation exists -- DOMAIN.md states terminal outcomes have no exit transition", () => {
  it("defines no reopen_report or similarly named function", () => {
    expect(finalitySql).not.toMatch(/function public\.\w*reopen\w*/i);
  });

  it("defines no generic update_status/set_status/change_status function either", () => {
    expect(finalitySql).not.toMatch(/function public\.(update|set|change)_(report_)?status/i);
  });
});

describe("migration source: authorization is unchanged -- no new role concept or capability introduced", () => {
  it("neither redefined function has an author_id/actor_id/researcher_id/organization_id-trusting parameter", () => {
    for (const fn of ["set_report_severity", "mark_duplicate"]) {
      const start = finalitySql.indexOf(`function public.${fn}(`);
      const signatureEnd = finalitySql.indexOf("\nreturns", start);
      const signature = finalitySql.slice(start, signatureEnd);
      expect(signature).not.toMatch(/author_id|actor_id|caller_id|researcher_id|organization_id/);
    }
  });
});

describe("migration source: every SECURITY DEFINER function in the report-resolution-finality migration pins search_path to ''", () => {
  const codeOnly = finalitySql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("has a matching search_path='' for each `language plpgsql` occurrence", () => {
    const setCount = (codeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languagePlpgsqlCount = (codeOnly.match(/language plpgsql/g) ?? []).length;
    expect(setCount).toBe(languagePlpgsqlCount);
  });
});

// --- 202608280002_bounty_decision_engine.sql ---------------------------------------

describe("migration source: bounty is never a property of a report row -- no reports.bounty_amount column, three separate tables instead", () => {
  it("adds no bounty-shaped column to the reports table anywhere in this migration", () => {
    const codeOnly = bountySql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(codeOnly).not.toMatch(/alter table public\.reports/);
    expect(codeOnly).not.toMatch(/bounty_amount/);
  });

  it("creates exactly the three documented tables: policy versions, severity ranges, and per-report decisions", () => {
    expect(bountySql).toContain("create table public.program_bounty_policy_versions");
    expect(bountySql).toContain("create table public.program_bounty_policy_severity_ranges");
    expect(bountySql).toContain("create table public.report_bounty_decisions");
    const createTableCount = (bountySql.match(/create table/g) ?? []).length;
    expect(createTableCount).toBe(3);
  });
});

describe("migration source: policy versions are never edited in place -- superseded_at plus a real unique(program_id, version_number) constraint", () => {
  it("has no update statement targeting program_bounty_policy_versions other than setting superseded_at", () => {
    const updates = bountySql.match(/update public\.program_bounty_policy_versions set [^;]+/g) ?? [];
    expect(updates.length).toBeGreaterThan(0);
    for (const statement of updates) {
      expect(statement).toMatch(/superseded_at = now\(\)/);
      expect(statement).not.toMatch(/version_number|currency\s*=/);
    }
  });

  it("enforces one version number per program as a real database constraint, not just application logic", () => {
    expect(bountySql).toContain("constraint program_bounty_policy_versions_program_version_key unique (program_id, version_number)");
  });

  it("has a partial index for finding the single effective (non-superseded) version efficiently", () => {
    expect(bountySql).toContain("create index program_bounty_policy_versions_effective_idx on public.program_bounty_policy_versions(program_id) where superseded_at is null");
  });
});

describe("migration source: all five severity tiers are mandatory, explicit numeric parameters -- never an optional JSON array", () => {
  const start = bountySql.indexOf("create or replace function public.create_bounty_policy_version(");
  const signatureEnd = bountySql.indexOf("\nreturns", start);
  const signature = bountySql.slice(start, signatureEnd);

  it("takes p_<tier>_min/p_<tier>_max as separate bigint parameters for every one of the five report_severity tiers", () => {
    for (const tier of ["none", "low", "medium", "high", "critical"]) {
      expect(signature).toMatch(new RegExp(`p_${tier}_min bigint`));
      expect(signature).toMatch(new RegExp(`p_${tier}_max bigint`));
    }
  });

  it("takes no jsonb parameter -- \"not configured\" can never be confused with \"configured to pay zero\"", () => {
    expect(signature).not.toMatch(/jsonb/);
  });

  it("validates every tier's min <= max and non-negative before writing anything", () => {
    const bodyEnd = bountySql.indexOf("\n$$;", start);
    const body = bountySql.slice(start, bodyEnd);
    expect(body).toMatch(/p_none_min > p_none_max or p_low_min > p_low_max or p_medium_min > p_medium_max or p_high_min > p_high_max or p_critical_min > p_critical_max/);
    expect(body).toMatch(/p_none_min < 0 or p_low_min < 0 or p_medium_min < 0 or p_high_min < 0 or p_critical_min < 0/);
  });
});

describe("migration source: money is bigint minor units everywhere, currency is format-checked rather than a fixed list", () => {
  const codeOnlyBounty = bountySql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("declares every amount column as bigint, never numeric/float/real/double/money", () => {
    expect(codeOnlyBounty).not.toMatch(/\b(numeric|float4|float8|real|double precision|money)\b/);
    expect(bountySql).toMatch(/min_amount_minor_units bigint not null check \(min_amount_minor_units >= 0\)/);
    expect(bountySql).toMatch(/max_amount_minor_units bigint not null check \(max_amount_minor_units >= min_amount_minor_units\)/);
    expect(bountySql).toMatch(/final_amount_minor_units bigint check \(final_amount_minor_units is null or final_amount_minor_units >= 0\)/);
  });

  it("checks currency against an ISO-4217 shape (3 uppercase letters), not a hardcoded currency list", () => {
    expect(bountySql).toContain("currency text not null check (currency ~ '^[A-Z]{3}$')");
    expect(bountySql).toContain("if p_currency !~ '^[A-Z]{3}$' then");
  });
});

describe("migration source: report_bounty_decisions has a real shape check constraint -- exactly one valid shape per state", () => {
  it("defines report_bounty_decisions_shape_check covering all three states, each independently", () => {
    expect(bountySql).toContain("constraint report_bounty_decisions_shape_check check (");
    expect(bountySql).toMatch(/state = 'ineligible' and ineligible_reason is not null and policy_version_id is null and final_amount_minor_units is null/);
    expect(bountySql).toMatch(/state = 'calculated' and policy_version_id is not null and severity_at_calculation is not null and calculated_min_amount_minor_units is not null and calculated_max_amount_minor_units is not null and final_amount_minor_units is null/);
    expect(bountySql).toMatch(/state = 'finalized' and policy_version_id is not null and final_amount_minor_units is not null and finalized_by is not null and finalized_at is not null/);
  });
});

describe("migration source: composite foreign keys pin every decision to its own tenant's report and its own program's policy version -- a database invariant, not just RPC discipline", () => {
  it("has a composite FK to reports(id, program_id, organization_id), reusing 0010's pattern", () => {
    expect(bountySql).toContain("foreign key (report_id, program_id, organization_id) references public.reports(id, program_id, organization_id) on delete cascade");
  });

  it("has a composite FK to program_bounty_policy_versions(id, program_id), so a cross-program policy_version_id is rejected at the database layer", () => {
    expect(bountySql).toContain("constraint program_bounty_policy_versions_id_program_id_key unique (id, program_id)");
    expect(bountySql).toContain("foreign key (policy_version_id, program_id) references public.program_bounty_policy_versions(id, program_id)");
  });
});

describe("migration source: RLS -- policy versions/ranges follow the same three-way read shape as scope entries (org oversight, program members, authorized researchers)", () => {
  it("grants program_bounty_policy_versions read to org admins, program members, or authorized researchers -- the same three private helpers as elsewhere", () => {
    const start = bountySql.indexOf('create policy "bounty policy versions read by org admins, program members, or authorized researchers"');
    const end = bountySql.indexOf(";", start);
    const body = bountySql.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])");
    expect(body).toContain("private.is_program_member(program_id)");
    expect(body).toContain("private.is_researcher_authorized_for_program(program_id)");
  });

  it("report_bounty_decisions grants read to the submitting researcher (their own report only), org admins, or program managers -- no internal/researcher-visible split exists for this table", () => {
    const start = bountySql.indexOf('create policy "report bounty decisions read by researcher, org admins, or program managers"');
    const end = bountySql.indexOf(";", start);
    const body = bountySql.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("exists (select 1 from public.reports r where r.id = report_id and r.researcher_id = auth.uid())");
    expect(body).not.toMatch(/visibility|internal/);
  });
});

describe("migration source: private.lock_and_authorize_report_for_finance is a materially narrower sibling of 0009's triage helper -- owner/security_admin only, no program_member fallback", () => {
  const start = bountySql.indexOf("create or replace function private.lock_and_authorize_report_for_finance(");
  const bodyEnd = bountySql.indexOf("\n$$;", start);
  const body = bountySql.slice(start, bodyEnd);

  it("is defined exactly once", () => {
    expect(start).toBeGreaterThan(-1);
    const count = (bountySql.match(/create or replace function private\.lock_and_authorize_report_for_finance\(/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("locks the reports row FOR UPDATE, the same row 0009's triage helper locks, so finance and triage operations serialize against each other", () => {
    expect(body).toMatch(/select \* into report from public\.reports where id = target_report_id for update;/);
  });

  it("authorizes via has_org_role(owner, security_admin) only -- never is_program_member", () => {
    expect(body).toContain("private.has_org_role(report.organization_id, array['owner', 'security_admin']::public.organization_member_role[])");
    expect(body).not.toContain("is_program_member");
  });

  it("derives the actor from auth.uid(), never a parameter", () => {
    const start2 = bountySql.indexOf("function private.lock_and_authorize_report_for_finance(");
    const signatureEnd = bountySql.indexOf("\nreturns", start2);
    const signature = bountySql.slice(start2, signatureEnd);
    expect(signature).not.toMatch(/actor_id|caller_id/);
  });
});

describe("migration source: calculate_bounty_recommendation distinguishes a retryable precondition (no row written) from a permanent classification fact (a real ineligible row)", () => {
  const start = bountySql.indexOf("create or replace function public.calculate_bounty_recommendation(");
  const bodyEnd = bountySql.indexOf("\n$$;", start);
  const body = bountySql.slice(start, bodyEnd);

  it("rejects SEVERITY_REQUIRED and NO_BOUNTY_POLICY without writing any row (they are fixable, not permanent)", () => {
    const severityCheckIndex = body.indexOf("SEVERITY_REQUIRED");
    const policyCheckIndex = body.indexOf("NO_BOUNTY_POLICY");
    expect(severityCheckIndex).toBeGreaterThan(-1);
    expect(policyCheckIndex).toBeGreaterThan(-1);
    expect(body.slice(severityCheckIndex, severityCheckIndex + 200)).not.toMatch(/insert into public\.report_bounty_decisions/);
  });

  it("writes a real, stored ineligible row (with an upsert) when the terminal status is not resolved -- a permanent fact, not a precondition", () => {
    expect(body).toMatch(/if report\.status <> 'resolved' then\s*\n\s*insert into public\.report_bounty_decisions/);
    expect(body).toContain("on conflict (report_id) do update set state = 'ineligible'");
  });

  it("guards against silently overwriting an already-finalized decision before doing anything else", () => {
    const guardIndex = body.indexOf("BOUNTY_ALREADY_FINALIZED");
    const firstInsertIndex = body.indexOf("insert into public.report_bounty_decisions");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(firstInsertIndex);
    expect(body).toMatch(/existing\.id is not null and existing\.state = 'finalized'/);
  });

  it("uses the broad triage authorization helper, not the narrow finance one -- calculating a recommendation is not yet a financial commitment", () => {
    expect(body).toContain("private.lock_and_authorize_report_for_triage(target_report_id)");
  });

  it("writes exactly one audit_logs row per outcome, always action 'bounty.calculated'", () => {
    const auditCount = (body.match(/insert into public\.audit_logs/g) ?? []).length;
    expect(auditCount).toBe(2); // one on the ineligible early-return path, one on the calculated path
    const bountyCalculatedCount = (body.match(/'bounty\.calculated'/g) ?? []).length;
    expect(bountyCalculatedCount).toBe(2);
  });
});

describe("migration source: finalize_bounty and adjust_bounty both use the narrow finance authorization helper and are idempotency-as-rejection, not silent no-ops", () => {
  it("finalize_bounty rejects an already-finalized decision by name, distinctly from a not-yet-ready decision", () => {
    const start = bountySql.indexOf("create or replace function public.finalize_bounty(");
    const bodyEnd = bountySql.indexOf("\n$$;", start);
    const body = bountySql.slice(start, bodyEnd);
    expect(body).toContain("private.lock_and_authorize_report_for_finance(target_report_id)");
    expect(body).toMatch(/if decision\.state = 'finalized' then\s*\n\s*raise exception 'BOUNTY_ALREADY_FINALIZED/);
    expect(body).toMatch(/if decision\.state = 'ineligible' then\s*\n\s*raise exception 'BOUNTY_NOT_READY/);
  });

  it("adjust_bounty requires an already-finalized decision and a non-empty reason, and records both the previous and new amount in its audit event", () => {
    const start = bountySql.indexOf("create or replace function public.adjust_bounty(");
    const bodyEnd = bountySql.indexOf("\n$$;", start);
    const body = bountySql.slice(start, bodyEnd);
    expect(body).toContain("private.lock_and_authorize_report_for_finance(target_report_id)");
    expect(body).toMatch(/decision\.id is null or decision\.state <> 'finalized'/);
    expect(body).toMatch(/char_length\(trimmed_reason\) = 0 then/);
    expect(body).toContain("jsonb_build_object('previous_amount_minor_units', decision.final_amount_minor_units, 'new_amount_minor_units', p_new_amount_minor_units, 'reason', trimmed_reason)");
  });

  it("neither function ever accepts a client-supplied actor/finalized_by/organization_id parameter", () => {
    for (const fn of ["finalize_bounty", "adjust_bounty"]) {
      const start = bountySql.indexOf(`function public.${fn}(`);
      const signatureEnd = bountySql.indexOf("\nreturns", start);
      const signature = bountySql.slice(start, signatureEnd);
      expect(signature).not.toMatch(/actor_id|caller_id|finalized_by|organization_id/);
    }
  });
});

describe("migration source: every audit_logs insert in this migration uses the correct entity_type for its scope -- 'program' for policy changes, 'report' for per-report decisions", () => {
  it("bounty.policy_version_created is entity_type='program' (so it never appears in the report-scoped Decision History panel)", () => {
    expect(bountySql).toMatch(/'bounty\.policy_version_created', 'program', target_program_id/);
  });

  it("bounty.calculated, bounty.finalized, and bounty.adjusted are all entity_type='report'", () => {
    expect(bountySql).toMatch(/'bounty\.calculated', 'report', target_report_id/);
    expect(bountySql).toMatch(/'bounty\.finalized', 'report', target_report_id/);
    expect(bountySql).toMatch(/'bounty\.adjusted', 'report', target_report_id/);
  });
});

describe("migration source: every mutation RPC in this migration derives the actor from auth.uid(), never a parameter, and is granted to authenticated only", () => {
  it("no function signature in this migration accepts an actor_id/caller_id parameter", () => {
    for (const fn of ["create_bounty_policy_version", "calculate_bounty_recommendation", "finalize_bounty", "adjust_bounty"]) {
      const start = bountySql.indexOf(`function public.${fn}(`);
      const signatureEnd = bountySql.indexOf("\nreturns", start);
      const signature = bountySql.slice(start, signatureEnd);
      expect(signature).not.toMatch(/actor_id|caller_id/);
    }
  });

  it("revokes all from public and grants execute to authenticated only, for every one of the four public RPCs", () => {
    for (const fn of ["create_bounty_policy_version", "calculate_bounty_recommendation", "finalize_bounty", "adjust_bounty"]) {
      expect(bountySql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public;`));
      expect(bountySql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`));
    }
    expect(bountySql).not.toMatch(/grant execute[^;]*to anon/);
  });
});

describe("migration source: no payment provider integration anywhere in this migration -- the payment boundary is not crossed", () => {
  it("contains no Stripe/Razorpay/PayPal/crypto/wallet reference", () => {
    expect(bountySql).not.toMatch(/stripe|razorpay|paypal|crypto|wallet|payout/i);
  });
});

describe("migration source: every SECURITY DEFINER function in the bounty-decision-engine migration pins search_path to ''", () => {
  const codeOnly = bountySql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("has a matching search_path='' for each `language plpgsql` occurrence", () => {
    const setCount = (codeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languagePlpgsqlCount = (codeOnly.match(/language plpgsql/g) ?? []).length;
    expect(setCount).toBe(languagePlpgsqlCount);
  });
});

// --- 202608290001_payment_ledger_and_payout_orchestration.sql ----------------------

describe("migration source: a finalized bounty decision is not a payment -- report_bounty_decisions is never altered by this migration", () => {
  it("contains no alter table statement targeting report_bounty_decisions other than adding the new composite-FK-target unique constraint", () => {
    const alters = paymentSql.match(/alter table public\.report_bounty_decisions [^;]+;/g) ?? [];
    expect(alters.length).toBe(1);
    expect(alters[0]).toContain("add constraint report_bounty_decisions_id_report_id_key unique (id, report_id)");
  });

  it("creates exactly two new tables: payment_obligations and payment_attempts", () => {
    expect(paymentSql).toContain("create table public.payment_obligations");
    expect(paymentSql).toContain("create table public.payment_attempts");
    const createTableCount = (paymentSql.match(/create table/g) ?? []).length;
    expect(createTableCount).toBe(2);
  });
});

describe("migration source: the one-to-one invariant (max one obligation per finalized bounty decision) is a real unique constraint", () => {
  it("declares bounty_decision_id as unique on payment_obligations, not merely checked in application code", () => {
    expect(paymentSql).toContain("bounty_decision_id uuid not null unique");
  });
});

describe("migration source: composite FKs pin every obligation to its own tenant's report, its own report's researcher, and its own report's bounty decision", () => {
  it("has a composite FK to reports(id, program_id, organization_id), reusing 0010's pattern", () => {
    expect(paymentSql).toContain("foreign key (report_id, program_id, organization_id) references public.reports(id, program_id, organization_id) on delete cascade");
  });

  it("has a composite FK tying the obligation's researcher to the same report's researcher -- a client can never substitute a different researcher", () => {
    expect(paymentSql).toContain("alter table public.reports add constraint reports_id_researcher_id_key unique (id, researcher_id)");
    expect(paymentSql).toContain("foreign key (report_id, researcher_id) references public.reports(id, researcher_id)");
  });

  it("has a composite FK tying the obligation's bounty_decision_id to the same report's decision -- a client can never substitute a different report's decision", () => {
    expect(paymentSql).toContain("alter table public.report_bounty_decisions add constraint report_bounty_decisions_id_report_id_key unique (id, report_id)");
    expect(paymentSql).toContain("foreign key (bounty_decision_id, report_id) references public.report_bounty_decisions(id, report_id)");
  });
});

describe("migration source: only the payment states this slice can actually produce are permitted -- no unreachable state added speculatively", () => {
  it("payment_obligations.status allows exactly the five reachable states", () => {
    expect(paymentSql).toContain("status text not null check (status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled'))");
  });

  it("payment_attempts.state allows exactly the three states this slice's RPCs can produce, and deliberately excludes an unreachable provider_pending from the schema itself", () => {
    expect(paymentSql).toContain("state text not null check (state in ('requires_operator_action', 'succeeded', 'failed'))");
    const codeOnlyPayment = paymentSql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(codeOnlyPayment).not.toContain("provider_pending");
  });

  it("payment_attempts has a shape check constraint enforcing exactly one valid column combination per state", () => {
    expect(paymentSql).toContain("constraint payment_attempts_shape_check check (");
    expect(paymentSql).toMatch(/state = 'requires_operator_action' and completed_at is null and failure_code is null and failure_message is null/);
    expect(paymentSql).toMatch(/state = 'succeeded' and completed_at is not null and failure_code is null and failure_message is null/);
    expect(paymentSql).toMatch(/state = 'failed' and completed_at is not null and failure_code is not null/);
  });
});

describe("migration source: money is bigint minor units everywhere, currency is format-checked, amounts must be positive", () => {
  const codeOnly = paymentSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("declares every amount column as bigint with a strictly-positive check, never numeric/float/real/double/money", () => {
    expect(codeOnly).not.toMatch(/\b(numeric|float4|float8|real|double precision|money)\b/);
    expect(paymentSql).toContain("amount_minor_units bigint not null check (amount_minor_units > 0)");
    expect(paymentSql).toContain("requested_amount_minor_units bigint not null check (requested_amount_minor_units > 0)");
  });

  it("checks currency against an ISO-4217 shape on both tables", () => {
    const currencyChecks = (paymentSql.match(/currency text not null check \(currency ~ '\^\[A-Z\]\{3\}\$'\)/g) ?? []).length;
    expect(currencyChecks).toBe(2);
  });
});

describe("migration source: RLS -- obligations are broadly readable (researcher/org admins/program managers), attempts are manager-only", () => {
  it("payment_obligations grants read to the obligation's own researcher, org admins, or program managers", () => {
    const start = paymentSql.indexOf('create policy "payment obligations read by researcher, org admins, or program managers"');
    const end = paymentSql.indexOf(";", start);
    const body = paymentSql.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("researcher_id = auth.uid()");
    expect(body).toContain("private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])");
    expect(body).toContain("private.is_program_member(program_id)");
  });

  it("payment_attempts grants read to org admins or program managers only -- no researcher_id path exists at all", () => {
    const start = paymentSql.indexOf('create policy "payment attempts read by org admins or program managers only"');
    const end = paymentSql.indexOf(";", start);
    const body = paymentSql.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(body).not.toMatch(/researcher_id/);
    expect(body).toContain("private.has_org_role(o.organization_id, array['owner', 'security_admin']::public.organization_member_role[])");
    expect(body).toContain("private.is_program_member(o.program_id)");
  });
});

describe("migration source: private.lock_and_authorize_obligation_for_finance is the obligation-keyed sibling of 0013's report-keyed finance helper -- identical narrow authorization", () => {
  const start = paymentSql.indexOf("create or replace function private.lock_and_authorize_obligation_for_finance(");
  const bodyEnd = paymentSql.indexOf("\n$$;", start);
  const body = paymentSql.slice(start, bodyEnd);

  it("is defined exactly once", () => {
    expect(start).toBeGreaterThan(-1);
    const count = (paymentSql.match(/create or replace function private\.lock_and_authorize_obligation_for_finance\(/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("locks the payment_obligations row FOR UPDATE before authorizing", () => {
    expect(body).toMatch(/select \* into obligation from public\.payment_obligations where id = target_obligation_id for update;/);
  });

  it("authorizes via has_org_role(owner, security_admin) only -- never is_program_member, matching 0013's finance helper exactly", () => {
    expect(body).toContain("private.has_org_role(obligation.organization_id, array['owner', 'security_admin']::public.organization_member_role[])");
    expect(body).not.toContain("is_program_member");
  });
});

describe("migration source: create_payment_obligation reuses 0013's report-finance helper unchanged and locks the decision row before checking for an existing obligation", () => {
  const start = paymentSql.indexOf("create or replace function public.create_payment_obligation(");
  const bodyEnd = paymentSql.indexOf("\n$$;", start);
  const body = paymentSql.slice(start, bodyEnd);

  it("reuses private.lock_and_authorize_report_for_finance rather than duplicating report-level authorization", () => {
    expect(body).toContain("private.lock_and_authorize_report_for_finance(target_report_id)");
  });

  it("locks the bounty decision row FOR UPDATE before checking finality or existing obligations -- race-free, not merely optimistically checked", () => {
    expect(body).toMatch(/select \* into decision from public\.report_bounty_decisions where report_id = target_report_id for update;/);
    const lockIndex = body.indexOf("for update;");
    const existingCheckIndex = body.indexOf("OBLIGATION_ALREADY_EXISTS");
    expect(lockIndex).toBeGreaterThan(-1);
    expect(existingCheckIndex).toBeGreaterThan(lockIndex);
  });

  it("requires state = 'finalized' and rejects a zero-amount finalized decision -- nothing to pay", () => {
    expect(body).toMatch(/decision\.id is null or decision\.state <> 'finalized'/);
    expect(body).toMatch(/decision\.final_amount_minor_units <= 0/);
  });

  it("never accepts amount, currency, researcher, organization, or bounty_decision_id as a parameter -- every value is copied server-side from the locked report/decision", () => {
    const signatureEnd = paymentSql.indexOf("\nreturns", start);
    const signature = paymentSql.slice(start, signatureEnd);
    expect(signature).toBe("create or replace function public.create_payment_obligation(target_report_id uuid)");
    expect(body).toContain("values (report.organization_id, report.program_id, target_report_id, report.researcher_id, decision.id, decision.final_amount_minor_units, decision.currency, 'pending')");
  });
});

describe("migration source: no generic initiate(provider)/updateStatus(status) RPC exists -- provider and target state are hardcoded by which function is called, never a parameter", () => {
  it("initiate_manual_payment_attempt takes only an obligation id -- no provider parameter", () => {
    const start = paymentSql.indexOf("function public.initiate_manual_payment_attempt(");
    const signatureEnd = paymentSql.indexOf("\nreturns", start);
    const signature = paymentSql.slice(start, signatureEnd);
    expect(signature).toBe("function public.initiate_manual_payment_attempt(target_obligation_id uuid)");
    const bodyEnd = paymentSql.indexOf("\n$$;", start);
    const body = paymentSql.slice(start, bodyEnd);
    expect(body).toContain("'manual', 'requires_operator_action'");
  });

  it("initiate_manual_payment_attempt distinguishes an already-processing race from a permanently-ineligible terminal state, with two distinct error codes", () => {
    const start = paymentSql.indexOf("function public.initiate_manual_payment_attempt(");
    const bodyEnd = paymentSql.indexOf("\n$$;", start);
    const body = paymentSql.slice(start, bodyEnd);
    expect(body).toContain("PAYMENT_ALREADY_PROCESSING");
    expect(body).toContain("PAYMENT_NOT_ELIGIBLE_FOR_ATTEMPT");
  });

  it("no function anywhere in this migration accepts a generic status/outcome-setting parameter without a corresponding validation branch", () => {
    expect(paymentSql).not.toMatch(/function public\.\w*update\w*status\w*/i);
    expect(paymentSql).not.toMatch(/function public\.\w*set_payment\w*/i);
  });
});

describe("migration source: record_manual_payment_result is the ONLY path to succeeded/failed -- never a side effect of initiation, and idempotency-as-rejection on an already-resolved attempt", () => {
  const start = paymentSql.indexOf("create or replace function public.record_manual_payment_result(");
  const bodyEnd = paymentSql.indexOf("\n$$;", start);
  const body = paymentSql.slice(start, bodyEnd);

  it("requires the attempt to still be in requires_operator_action before accepting a result", () => {
    expect(body).toMatch(/if attempt\.state <> 'requires_operator_action' then\s*\n\s*raise exception 'ATTEMPT_ALREADY_RESOLVED/);
  });

  it("requires a failure code whenever the outcome is 'failed'", () => {
    expect(body).toMatch(/p_outcome = 'failed' and trimmed_failure_code is null/);
  });

  it("uses the obligation-keyed finance helper, not the report-keyed one -- this RPC is keyed by attempt id, not report id", () => {
    expect(body).toContain("private.lock_and_authorize_obligation_for_finance(attempt.payment_obligation_id)");
  });
});

describe("migration source: cancel_payment_obligation is legal only from pending/failed -- never while an attempt is in flight, never once terminal", () => {
  const start = paymentSql.indexOf("create or replace function public.cancel_payment_obligation(");
  const bodyEnd = paymentSql.indexOf("\n$$;", start);
  const body = paymentSql.slice(start, bodyEnd);

  it("rejects any status other than pending/failed", () => {
    expect(body).toMatch(/obligation\.status not in \('pending', 'failed'\)/);
  });

  it("requires a non-empty reason, mirroring adjust_bounty's own reason requirement", () => {
    expect(body).toMatch(/char_length\(trimmed_reason\) = 0 then/);
  });
});

describe("migration source: every audit_logs insert in this migration uses entity_type='report' -- the existing getReportAuditActivity read path picks up every payment.* event with no service-layer change", () => {
  it("all five payment.* actions are entity_type='report'", () => {
    expect(paymentSql).toMatch(/'payment\.obligation_created', 'report', target_report_id/);
    expect(paymentSql).toMatch(/'payment\.initiated', 'report', obligation\.report_id/);
    expect(paymentSql).toContain("case when p_outcome = 'succeeded' then 'payment.succeeded' else 'payment.failed' end,\n    'report', obligation.report_id");
    expect(paymentSql).toMatch(/'payment\.cancelled', 'report', obligation\.report_id/);
  });
});

describe("migration source: every mutation RPC in this migration derives the actor from auth.uid(), never a parameter, and is granted to authenticated only", () => {
  it("no function signature in this migration accepts an actor_id/caller_id/organization_id/researcher_id-trusting parameter", () => {
    for (const fn of ["create_payment_obligation", "initiate_manual_payment_attempt", "record_manual_payment_result", "cancel_payment_obligation"]) {
      const start = paymentSql.indexOf(`function public.${fn}(`);
      const signatureEnd = paymentSql.indexOf("\nreturns", start);
      const signature = paymentSql.slice(start, signatureEnd);
      expect(signature).not.toMatch(/actor_id|caller_id|organization_id|researcher_id|p_amount|p_currency/);
    }
  });

  it("revokes all from public and grants execute to authenticated only, for every one of the four public RPCs", () => {
    for (const fn of ["create_payment_obligation", "initiate_manual_payment_attempt", "record_manual_payment_result", "cancel_payment_obligation"]) {
      expect(paymentSql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public;`));
      expect(paymentSql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`));
    }
    expect(paymentSql).not.toMatch(/grant execute[^;]*to anon/);
  });
});

describe("migration source: no payment provider SDK anywhere in this migration -- the payment domain owns its own ids and state", () => {
  it("contains no Stripe/Razorpay/PayPal/crypto/wallet/bank reference", () => {
    expect(paymentSql).not.toMatch(/stripe|razorpay|paypal|crypto|wallet/i);
  });
});

describe("migration source: every SECURITY DEFINER function in the payment-ledger migration pins search_path to ''", () => {
  const codeOnly = paymentSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("has a matching search_path='' for each `language plpgsql` occurrence", () => {
    const setCount = (codeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languagePlpgsqlCount = (codeOnly.match(/language plpgsql/g) ?? []).length;
    expect(setCount).toBe(languagePlpgsqlCount);
  });
});

// --- 202608290002_outbox_event_foundation.sql ---------------------------------------

describe("migration source: outbox_events is a genuinely different table from audit_logs -- no replacement, no shared table", () => {
  it("creates two new tables, outbox_events and outbox_event_receipts, never altering audit_logs", () => {
    expect(outboxSql).toContain("create table public.outbox_events");
    expect(outboxSql).toContain("create table public.outbox_event_receipts");
    expect(outboxCodeOnly).not.toMatch(/alter table public\.audit_logs/);
    const createTableCount = (outboxSql.match(/create table/g) ?? []).length;
    expect(createTableCount).toBe(2);
  });
});

describe("migration source: only four states exist, all reachable -- no speculative 'failed' state distinct from a retryable 'pending'", () => {
  it("outbox_events.status allows exactly pending/processing/succeeded/dead_letter", () => {
    expect(outboxSql).toContain("status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'dead_letter'))");
  });

  it("has a shape check constraint tying locked_at/locked_by to status = 'processing' exactly", () => {
    expect(outboxSql).toContain("constraint outbox_events_shape_check check (");
    expect(outboxSql).toMatch(/status in \('pending', 'succeeded', 'dead_letter'\) and locked_at is null and locked_by is null/);
    expect(outboxSql).toMatch(/status = 'processing' and locked_at is not null and locked_by is not null/);
  });
});

describe("migration source: aggregate_id is deliberately polymorphic and has no foreign key -- the same accepted tradeoff audit_logs.entity_id already makes", () => {
  it("aggregate_id has no 'references' clause, unlike organization_id which does", () => {
    expect(outboxSql).toContain("aggregate_id uuid not null,");
    expect(outboxSql).not.toMatch(/aggregate_id uuid not null references/);
    expect(outboxSql).toContain("organization_id uuid not null references public.organizations(id) on delete cascade");
  });
});

describe("migration source: RLS -- zero permissive policies for authenticated/anon on either table, and no base table grant either", () => {
  it("enables RLS on both tables", () => {
    expect(outboxSql).toContain("alter table public.outbox_events enable row level security");
    expect(outboxSql).toContain("alter table public.outbox_event_receipts enable row level security");
  });

  it("creates no policy at all referencing 'to authenticated' or 'to anon' for these tables -- absence, not a narrow policy", () => {
    expect(outboxCodeOnly).not.toMatch(/create policy[^;]*outbox_event/is);
  });

  it("explicitly revokes from authenticated/anon and grants only to service_role", () => {
    expect(outboxSql).toContain("revoke all on public.outbox_events, public.outbox_event_receipts from authenticated, anon");
    expect(outboxSql).toContain("grant select, insert, update, delete on public.outbox_events, public.outbox_event_receipts to service_role");
  });
});

describe("migration source: claim_outbox_events uses FOR UPDATE SKIP LOCKED and is granted only to service_role", () => {
  const start = outboxSql.indexOf("create or replace function public.claim_outbox_events(");
  const bodyEnd = outboxSql.indexOf("\n$$;", start);
  const body = outboxSql.slice(start, bodyEnd);

  it("is defined exactly once", () => {
    expect(start).toBeGreaterThan(-1);
    const count = (outboxSql.match(/create or replace function public\.claim_outbox_events\(/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("uses `for update skip locked` inside the claim CTE -- the actual multi-worker safety mechanism", () => {
    expect(body).toMatch(/for update skip locked/);
  });

  it("dead-letters an abandoned, attempts-exhausted lease BEFORE the claim query runs -- closing the eternal-crash-loop gap", () => {
    const deadLetterIndex = body.indexOf("status = 'dead_letter'");
    const claimIndex = body.indexOf("with claimable as");
    expect(deadLetterIndex).toBeGreaterThan(-1);
    expect(claimIndex).toBeGreaterThan(deadLetterIndex);
    expect(body).toMatch(/locked_at < now\(\) - make_interval\(secs => p_lease_seconds\)\s*\n\s*and attempts >= max_attempts/);
  });

  it("the claimable predicate covers both genuinely-pending-and-due AND processing-with-an-expired-lease -- no separate reaper process needed", () => {
    expect(body).toMatch(/o\.status = 'pending' and o\.available_at <= now\(\)/);
    expect(body).toMatch(/o\.status = 'processing' and o\.locked_at < now\(\) - make_interval\(secs => p_lease_seconds\)/);
  });

  it("is revoked from public/authenticated/anon and granted only to service_role", () => {
    expect(outboxSql).toContain("revoke all on function public.claim_outbox_events(text, integer, integer) from public, authenticated, anon");
    expect(outboxSql).toContain("grant execute on function public.claim_outbox_events(text, integer, integer) to service_role");
    expect(outboxSql).not.toMatch(/grant execute on function public\.claim_outbox_events[^;]*to authenticated/);
  });
});

describe("migration source: complete_outbox_event is the sole path out of 'processing', requires lease ownership, and treats 'permanent' as bypassing retry entirely", () => {
  const start = outboxSql.indexOf("create or replace function public.complete_outbox_event(");
  const bodyEnd = outboxSql.indexOf("\n$$;", start);
  const body = outboxSql.slice(start, bodyEnd);

  it("rejects a caller that does not hold the current lease (LEASE_LOST), rather than silently overwriting another worker's claim", () => {
    expect(body).toMatch(/if event\.locked_by <> p_worker_id then\s*\n\s*raise exception 'LEASE_LOST/);
  });

  it("dead-letters when p_permanent is true, regardless of attempts remaining -- checked with `or`, not requiring both conditions", () => {
    expect(body).toMatch(/elsif p_permanent or event\.attempts >= event\.max_attempts then/);
  });

  it("is revoked from public/authenticated/anon and granted only to service_role", () => {
    expect(outboxSql).toContain("revoke all on function public.complete_outbox_event(uuid, text, boolean, boolean, text) from public, authenticated, anon");
    expect(outboxSql).toContain("grant execute on function public.complete_outbox_event(uuid, text, boolean, boolean, text) to service_role");
  });
});

describe("migration source: private.outbox_backoff_seconds is a pure, deterministic, capped exponential backoff -- no randomness, no external state", () => {
  it("is immutable (a pure function of its input) and capped at 300 seconds", () => {
    const start = outboxSql.indexOf("create or replace function private.outbox_backoff_seconds(");
    const bodyEnd = outboxSql.indexOf("\n$$;", start);
    const body = outboxSql.slice(start, bodyEnd);
    expect(body).toContain("immutable");
    expect(body).toContain("least(power(2, greatest(p_attempts, 0))::integer, 300)");
    expect(body).not.toMatch(/random\(\)|now\(\)|clock_timestamp/);
  });
});

describe("migration source: submit_report is redefined (not duplicated) to add exactly one outbox insert, in the same transaction as its existing report insert and audit event", () => {
  const start = outboxSql.indexOf("create or replace function public.submit_report(");
  const bodyEnd = outboxSql.indexOf("\n$$;", start);
  const body = outboxSql.slice(start, bodyEnd);

  it("is defined exactly once in this file", () => {
    expect(start).toBeGreaterThan(-1);
    const count = (outboxSql.match(/create or replace function public\.submit_report\(/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("still authorizes and validates exactly as 0008 originally established -- unchanged", () => {
    expect(body).toContain("private.is_researcher_authorized_for_program(target_program_id)");
    expect(body).toContain("private.match_program_scope(");
    expect(body).toContain("TARGET_NOT_ELIGIBLE");
  });

  it("inserts exactly one outbox_events row, of type report.created v1, after the report row and its audit event, in the same function invocation (same transaction)", () => {
    const reportInsertIndex = body.indexOf("insert into public.reports");
    const auditInsertIndex = body.indexOf("insert into public.audit_logs");
    const outboxInsertIndex = body.indexOf("insert into public.outbox_events");
    expect(reportInsertIndex).toBeGreaterThan(-1);
    expect(auditInsertIndex).toBeGreaterThan(reportInsertIndex);
    expect(outboxInsertIndex).toBeGreaterThan(auditInsertIndex);
    expect(body).toContain("'report.created', 1, 'report', new_report.id, program.organization_id");
    const outboxInsertCount = (body.match(/insert into public\.outbox_events/g) ?? []).length;
    expect(outboxInsertCount).toBe(1);
  });

  it("the emitted payload includes report_id/program_id/organization_id/researcher_id/title/asset_type/display_target -- the documented ReportCreatedV1Payload shape", () => {
    expect(body).toMatch(/'report_id', new_report\.id, 'program_id', target_program_id, 'organization_id', program\.organization_id/);
    expect(body).toMatch(/'researcher_id', actor, 'title', trimmed_title, 'asset_type', p_asset_type, 'display_target', canon\.display/);
  });

  it("still grants execute to authenticated only, unchanged from 0008", () => {
    expect(outboxSql).toContain("revoke all on function public.submit_report(uuid, public.program_asset_type, text, text, text) from public");
    expect(outboxSql).toContain("grant execute on function public.submit_report(uuid, public.program_asset_type, text, text, text) to authenticated");
  });
});

describe("migration source: no payment domain change, no product-feature RPC (notifications/reputation/analytics) added in this migration", () => {
  it("contains no reference to payment_obligations, payment_attempts, or any provider SDK", () => {
    expect(outboxCodeOnly).not.toMatch(/payment_obligations|payment_attempts|stripe|razorpay|paypal/i);
  });

  it("defines no function named anything like notify/reputation/analytics/search", () => {
    expect(outboxSql).not.toMatch(/function public\.\w*(notify|reputation|analytic|search)\w*/i);
  });
});

describe("migration source: every SECURITY DEFINER function in the outbox migration pins search_path to '' -- including the two non-security-definer service-role-only functions, which pin it too", () => {
  it("has a matching search_path='' for each `language plpgsql`/`language sql` occurrence", () => {
    const setCount = (outboxCodeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languageCount = (outboxCodeOnly.match(/language (plpgsql|sql)/g) ?? []).length;
    expect(setCount).toBe(languageCount);
  });

  it("claim_outbox_events/complete_outbox_event are deliberately SECURITY INVOKER, not DEFINER -- only service_role can ever call them, and service_role already has full table access, so no privilege escalation is needed", () => {
    for (const fn of ["claim_outbox_events", "complete_outbox_event"]) {
      const start = outboxSql.indexOf(`function public.${fn}(`);
      const bodyStart = outboxSql.indexOf("language plpgsql", start);
      const signature = outboxSql.slice(start, bodyStart);
      expect(signature).not.toMatch(/security definer/);
    }
  });
});

// --- 202608290003_reputation_ledger_foundation.sql -----------------------------------

describe("migration source: no mutable reputation_score column is created -- the pre-existing Phase 1 column is never referenced", () => {
  it("this migration never mentions reputation_score or researcher_profiles", () => {
    expect(reputationCodeOnly).not.toMatch(/reputation_score|researcher_profiles/i);
  });

  it("creates exactly one new table, reputation_ledger", () => {
    expect(reputationSql).toContain("create table public.reputation_ledger");
    const createTableCount = (reputationSql.match(/create table/g) ?? []).length;
    expect(createTableCount).toBe(1);
  });
});

describe("migration source: FACT, never INTERPRETATION -- no score/value/points column exists on reputation_ledger", () => {
  it("has a fact_type column constrained to exactly the six documented fact types, and no numeric value/score/points column", () => {
    expect(reputationSql).toContain(
      "fact_type text not null check (fact_type in ('report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable', 'report_rejected', 'bounty_finalized'))",
    );
    expect(reputationCodeOnly).not.toMatch(/\b(score|points|value|weight)\b\s+(integer|bigint|numeric|int)/i);
  });

  it("bounty_finalized never carries an amount or currency column", () => {
    const start = reputationSql.indexOf("create or replace function public.record_bounty_finalized_reputation_fact(");
    const bodyEnd = reputationSql.indexOf("\n$$;", start);
    const body = reputationSql.slice(start, bodyEnd);
    expect(body).not.toMatch(/amount|currency/i);
  });
});

describe("migration source: append-only is enforced by a real trigger, not merely the absence of an update RPC", () => {
  it("defines a trigger function that unconditionally raises on any invocation", () => {
    expect(reputationSql).toContain("create or replace function private.reject_reputation_ledger_mutation()");
    expect(reputationSql).toContain("returns trigger");
    expect(reputationSql).toMatch(/raise exception 'REPUTATION_LEDGER_APPEND_ONLY/);
  });

  it("attaches that trigger to both UPDATE and DELETE on reputation_ledger", () => {
    expect(reputationSql).toContain("create trigger reputation_ledger_no_update before update on public.reputation_ledger");
    expect(reputationSql).toContain("create trigger reputation_ledger_no_delete before delete on public.reputation_ledger");
  });

  it("grants service_role select and insert only -- never update or delete", () => {
    expect(reputationSql).toContain("grant select, insert on public.reputation_ledger to service_role");
    expect(reputationCodeOnly).not.toMatch(/grant[^;]*update[^;]*on public\.reputation_ledger/i);
    expect(reputationCodeOnly).not.toMatch(/grant[^;]*delete[^;]*on public\.reputation_ledger/i);
  });
});

describe("migration source: idempotency is source_event_id unique directly on reputation_ledger -- a reputation-specific boundary, not the generic outbox_event_receipts table", () => {
  it("source_event_id is declared unique and references outbox_events", () => {
    expect(reputationSql).toContain("source_event_id uuid not null unique references public.outbox_events(id) on delete restrict");
  });

  it("neither insertion RPC references outbox_event_receipts -- this consumer uses its own row's uniqueness instead", () => {
    expect(reputationCodeOnly).not.toMatch(/outbox_event_receipts/);
  });

  it("both insertion RPCs check for an existing row by source_event_id first and return it unchanged, rather than raising or inserting a duplicate", () => {
    for (const fn of ["record_reputation_fact", "record_bounty_finalized_reputation_fact"]) {
      const start = reputationSql.indexOf(`create or replace function public.${fn}(`);
      const bodyEnd = reputationSql.indexOf("\n$$;", start);
      const body = reputationSql.slice(start, bodyEnd);
      expect(body).toMatch(/select \* into existing from public\.reputation_ledger where source_event_id = p_source_event_id;/);
      expect(body).toMatch(/if existing\.id is not null then\s*\n\s*return existing;/);
    }
  });

  it("both insertion RPCs catch unique_violation on the insert and return the winning row, rather than surfacing a raw error to a genuinely concurrent caller", () => {
    for (const fn of ["record_reputation_fact", "record_bounty_finalized_reputation_fact"]) {
      const start = reputationSql.indexOf(`create or replace function public.${fn}(`);
      const bodyEnd = reputationSql.indexOf("\n$$;", start);
      const body = reputationSql.slice(start, bodyEnd);
      expect(body).toMatch(/exception\s*\n\s*when unique_violation then/);
      expect(body).toMatch(/select \* into inserted from public\.reputation_ledger where source_event_id = p_source_event_id;/);
    }
  });
});

describe("migration source: provenance is re-derived server-side from the authoritative source table, never trusted from the event payload", () => {
  it("record_reputation_fact takes no researcher_id/organization_id/program_id/severity parameter -- only source_event_id, fact_type, report_id, occurred_at", () => {
    const start = reputationSql.indexOf("create or replace function public.record_reputation_fact(");
    const signatureEnd = reputationSql.indexOf("\nreturns", start);
    const signature = reputationSql.slice(start, signatureEnd);
    expect(signature).toBe("create or replace function public.record_reputation_fact(p_source_event_id uuid, p_fact_type text, p_report_id uuid, p_occurred_at timestamptz)");
  });

  it("record_reputation_fact rejects a claimed fact_type that does not match the report's actual current status -- a real provenance check, not a trust", () => {
    const start = reputationSql.indexOf("create or replace function public.record_reputation_fact(");
    const bodyEnd = reputationSql.indexOf("\n$$;", start);
    const body = reputationSql.slice(start, bodyEnd);
    expect(body).toMatch(/if report\.status <> expected_status then\s*\n\s*raise exception 'PROVENANCE_MISMATCH/);
  });

  it("record_bounty_finalized_reputation_fact independently re-verifies report_bounty_decisions.state = 'finalized', never trusting the event", () => {
    const start = reputationSql.indexOf("create or replace function public.record_bounty_finalized_reputation_fact(");
    const bodyEnd = reputationSql.indexOf("\n$$;", start);
    const body = reputationSql.slice(start, bodyEnd);
    expect(body).toMatch(/if decision\.id is null or decision\.state <> 'finalized' then/);
  });

  it("every inserted row copies researcher_id/organization_id/program_id/confirmed_severity from the locked reports row, never from a parameter", () => {
    expect(reputationSql).toContain(
      "report.researcher_id, report.organization_id, report.program_id, report.id, p_fact_type, report.confirmed_severity,",
    );
  });
});

describe("migration source: database invariants -- composite FKs tie every fact to its own tenant's report, and a shape check ties duplicate_of_report_id to fact_type exactly", () => {
  it("has composite FKs to reports(id, program_id, organization_id) and reports(id, researcher_id)", () => {
    expect(reputationSql).toContain("foreign key (report_id, program_id, organization_id) references public.reports(id, program_id, organization_id) on delete cascade");
    expect(reputationSql).toContain("foreign key (report_id, researcher_id) references public.reports(id, researcher_id)");
  });

  it("duplicate_of_report_id is populated if and only if fact_type = 'report_duplicate'", () => {
    expect(reputationSql).toContain("constraint reputation_ledger_duplicate_shape_check check ((fact_type = 'report_duplicate') = (duplicate_of_report_id is not null))");
  });

  it("compensates_fact_id is reserved (self-referencing FK) but never populated by any insert in this migration", () => {
    expect(reputationSql).toContain("compensates_fact_id uuid references public.reputation_ledger(id) on delete restrict");
    expect(reputationCodeOnly).not.toMatch(/compensates_fact_id\s*[,)]?\s*\)?\s*values|compensates_fact_id\s*=/);
  });
});

describe("migration source: RLS -- the owning researcher and their own organization can read reputation_ledger, no one else", () => {
  const start = reputationSql.indexOf('create policy "reputation ledger read by the owning researcher or their own organization"');
  const end = reputationSql.indexOf(";", start);
  const body = reputationSql.slice(start, end);

  it("policy exists and is scoped to authenticated", () => {
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("for select to authenticated");
  });

  it("grants the owning researcher (researcher_id = auth.uid()) or the report's own org (has_org_role/is_program_member), and nothing broader", () => {
    expect(body).toContain("researcher_id = auth.uid()");
    expect(body).toContain("private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])");
    expect(body).toContain("private.is_program_member(program_id)");
  });
});

describe("migration source: no client can insert a reputation fact directly -- both insertion RPCs are service_role only, exactly like claim_outbox_events/complete_outbox_event", () => {
  it("revokes from public/authenticated/anon and grants only to service_role", () => {
    expect(reputationSql).toContain("revoke all on function public.record_reputation_fact(uuid, text, uuid, timestamptz) from public, authenticated, anon");
    expect(reputationSql).toContain("revoke all on function public.record_bounty_finalized_reputation_fact(uuid, uuid, timestamptz) from public, authenticated, anon");
    expect(reputationSql).toContain("grant execute on function public.record_reputation_fact(uuid, text, uuid, timestamptz) to service_role");
    expect(reputationSql).toContain("grant execute on function public.record_bounty_finalized_reputation_fact(uuid, uuid, timestamptz) to service_role");
  });
});

describe("migration source: get_my_reputation_summary is self-only (no parameter) and grants execute to authenticated only", () => {
  it("takes no parameters -- the actor comes only from auth.uid()", () => {
    expect(reputationSql).toContain("create or replace function public.get_my_reputation_summary()");
  });

  it("rejects an unauthenticated caller and groups by fact_type with a plain count, never a formula", () => {
    const start = reputationSql.indexOf("create or replace function public.get_my_reputation_summary(");
    const bodyEnd = reputationSql.indexOf("\n$$;", start);
    const body = reputationSql.slice(start, bodyEnd);
    expect(body).toContain("if actor is null then raise exception 'AUTH_REQUIRED");
    expect(body).toContain("where r.researcher_id = actor");
    expect(body).toMatch(/select r\.fact_type, count\(\*\) as fact_count/);
  });

  it("is granted to authenticated (unlike the two insertion RPCs)", () => {
    expect(reputationSql).toContain("grant execute on function public.get_my_reputation_summary() to authenticated");
  });
});

describe("migration source: the five report-outcome RPCs and finalize_bounty are redefined (not duplicated) to add exactly one outbox insert each, after their existing audit_logs insert, in the same transaction", () => {
  const cases: Array<[string, string, string]> = [
    ["resolve_report", "report.resolved", "public.reports"],
    ["mark_duplicate", "report.duplicate", "public.reports"],
    ["mark_informative", "report.informative", "public.reports"],
    ["mark_not_applicable", "report.not_applicable", "public.reports"],
    ["reject_report", "report.rejected", "public.reports"],
    ["finalize_bounty", "bounty.finalized", "public.report_bounty_decisions"],
  ];

  it.each(cases)("%s is defined exactly once and emits exactly one %s outbox insert after its audit insert", (fn, eventType) => {
    const count = (reputationSql.match(new RegExp(`create or replace function public\\.${fn}\\(`, "g")) ?? []).length;
    expect(count).toBe(1);

    const start = reputationSql.indexOf(`create or replace function public.${fn}(`);
    const bodyEnd = reputationSql.indexOf("\n$$;", start);
    const body = reputationSql.slice(start, bodyEnd);
    const auditIndex = body.lastIndexOf("insert into public.audit_logs");
    const outboxIndex = body.indexOf("insert into public.outbox_events");
    expect(auditIndex).toBeGreaterThan(-1);
    expect(outboxIndex).toBeGreaterThan(auditIndex);
    const outboxInsertCount = (body.match(/insert into public\.outbox_events/g) ?? []).length;
    expect(outboxInsertCount).toBe(1);
    expect(body).toContain(`'${eventType}', 1, 'report',`);
  });

  it("every emitted payload uses the shared minimal shape (report_id/program_id/organization_id/researcher_id), never a duplicate_of_report_id or amount", () => {
    for (const [fn] of cases) {
      const start = reputationSql.indexOf(`create or replace function public.${fn}(`);
      const bodyEnd = reputationSql.indexOf("\n$$;", start);
      const body = reputationSql.slice(start, bodyEnd);
      const outboxStart = body.indexOf("insert into public.outbox_events");
      const outboxPayload = body.slice(outboxStart, body.indexOf(";", outboxStart));
      expect(outboxPayload).toContain("jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id, 'researcher_id', report.researcher_id)");
    }
  });

  it("none of the six redefinitions changed any pre-existing authorization/validation line -- the lock/authorize call and the transition/state check are unchanged from the prior migration", () => {
    expect(reputationSql).toContain("private.lock_and_authorize_report_for_triage(target_report_id)");
    expect(reputationSql).toContain("private.lock_and_authorize_report_for_finance(target_report_id)");
    expect(reputationSql).toContain("private.is_valid_report_transition(report.status, 'resolved')");
    expect(reputationSql).toContain("BOUNTY_ALREADY_FINALIZED");
  });
});

describe("migration source: no payment/provider SDK, no notification/leaderboard/badge/XP feature added by this migration", () => {
  it("contains no reference to a payment provider SDK", () => {
    expect(reputationCodeOnly).not.toMatch(/stripe|razorpay|paypal/i);
  });

  it("defines no function named anything like leaderboard/badge/xp/rank/notify", () => {
    expect(reputationSql).not.toMatch(/function public\.\w*(leaderboard|badge|xp|rank|notify)\w*/i);
  });
});

describe("migration source: every function in the reputation migration pins search_path to ''", () => {
  it("has a matching search_path='' for each `language plpgsql` occurrence", () => {
    const setCount = (reputationCodeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languagePlpgsqlCount = (reputationCodeOnly.match(/language plpgsql/g) ?? []).length;
    expect(setCount).toBe(languagePlpgsqlCount);
  });
});

const notificationMigrationPath = `${repoRoot}db/migrations/202608290004_notification_routing_and_delivery_foundation.sql`;
const notificationSql = readFileSync(notificationMigrationPath, "utf8");
const notificationCodeOnly = notificationSql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("migration source: notifications is content-free -- no report title/description/bounty amount is ever denormalized onto it", () => {
  it("has exactly three new tables in this migration", () => {
    const count = (notificationSql.match(/^create table public\./gm) ?? []).length;
    expect(count).toBe(3);
  });

  it("notifications has category constrained to exactly two values and notification_type to exactly seven, with no title/description/amount/currency column", () => {
    expect(notificationSql).toContain("category text not null check (category in ('report_activity', 'bounty_activity'))");
    expect(notificationSql).toContain(
      "notification_type text not null check (notification_type in (\n    'report_created', 'report_resolved', 'report_duplicate', 'report_informative',\n    'report_not_applicable', 'report_rejected', 'bounty_finalized'\n  ))",
    );
    const start = notificationSql.indexOf("create table public.notifications (");
    const end = notificationSql.indexOf(");", start);
    const body = notificationSql.slice(start, end);
    expect(body).not.toMatch(/\b(title|description|amount|currency)\b/);
  });

  it("a shape-check constraint ties category to notification_type deterministically -- category is never an independent client choice", () => {
    expect(notificationSql).toContain("constraint notifications_category_matches_type_check check (");
    expect(notificationSql).toContain("(category = 'report_activity' and notification_type in ('report_created', 'report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable', 'report_rejected'))");
    expect(notificationSql).toContain("(category = 'bounty_activity' and notification_type = 'bounty_finalized')");
  });
});

describe("migration source: notification idempotency is a real unique constraint, not 'we checked first'", () => {
  it("notifications has unique(source_event_id, recipient_id) -- the same event redelivered can never create a second row for the same recipient", () => {
    expect(notificationSql).toContain("constraint notifications_source_event_recipient_key unique (source_event_id, recipient_id)");
  });

  it("notification_deliveries has unique(notification_id, channel) -- at most one delivery row per notification per channel", () => {
    expect(notificationSql).toContain("constraint notification_deliveries_notification_channel_key unique (notification_id, channel)");
  });

  it("route_and_create_notifications inserts with on conflict (source_event_id, recipient_id) do nothing -- the database, not application logic, is the guarantee", () => {
    const start = notificationSql.indexOf("create or replace function public.route_and_create_notifications(");
    const bodyEnd = notificationSql.indexOf("\n$$;", start);
    const body = notificationSql.slice(start, bodyEnd);
    expect((body.match(/on conflict \(source_event_id, recipient_id\) do nothing/g) ?? []).length).toBe(2);
  });

  it("ensure_email_delivery inserts with on conflict (notification_id, channel) do nothing", () => {
    const start = notificationSql.indexOf("create or replace function public.ensure_email_delivery(");
    const bodyEnd = notificationSql.indexOf("\n$$;", start);
    const body = notificationSql.slice(start, bodyEnd);
    expect(body).toContain("on conflict (notification_id, channel) do nothing");
  });
});

describe("migration source: provenance is re-derived and re-verified, never trusted from the event payload", () => {
  it("route_and_create_notifications takes no category/recipient/organization parameter -- only source_event_id, notification_type, report_id, occurred_at", () => {
    const start = notificationSql.indexOf("create or replace function public.route_and_create_notifications(");
    const signatureEnd = notificationSql.indexOf("\nreturns", start);
    const signature = notificationSql.slice(start, signatureEnd);
    expect(signature).toContain("p_source_event_id uuid,");
    expect(signature).toContain("p_notification_type text,");
    expect(signature).toContain("p_report_id uuid,");
    expect(signature).toContain("p_occurred_at timestamptz");
    expect(signature).not.toMatch(/p_category|p_recipient|p_organization_id/);
  });

  it("re-verifies the claimed notification_type against the report's actual current status (report-outcome types) or a real finalized bounty decision (bounty_finalized) -- the identical PROVENANCE_MISMATCH pattern as 0016", () => {
    const start = notificationSql.indexOf("create or replace function public.route_and_create_notifications(");
    const bodyEnd = notificationSql.indexOf("\n$$;", start);
    const body = notificationSql.slice(start, bodyEnd);
    expect(body).toMatch(/if report\.status <> expected_status then\s*\n\s*raise exception 'PROVENANCE_MISMATCH/);
    expect(body).toContain("if not exists (select 1 from public.report_bounty_decisions d where d.report_id = p_report_id and d.state = 'finalized') then");
  });

  it("private.can_currently_read_report re-implements the exact reports RLS predicate (researcher, org owner/security_admin, or program manager) for an explicit candidate user, never auth.uid()", () => {
    const start = notificationSql.indexOf("create or replace function private.can_currently_read_report(");
    const bodyEnd = notificationSql.indexOf("\n$$;", start);
    const body = notificationSql.slice(start, bodyEnd);
    expect(body).toContain("r.researcher_id = candidate_user_id");
    expect(body).toMatch(/om\.role in \('owner', 'security_admin'\)/);
    expect(body).toContain("pm.program_id = r.program_id and pm.user_id = candidate_user_id");
    expect(body).not.toMatch(/auth\.uid\(\)/);
  });

  it("prepare_notification_email re-verifies authorization via can_currently_read_report immediately before returning any content, and marks the delivery permanently failed on denial rather than ever leaking content", () => {
    const start = notificationSql.indexOf("create or replace function public.prepare_notification_email(");
    const bodyEnd = notificationSql.indexOf("\n$$;", start);
    const body = notificationSql.slice(start, bodyEnd);
    expect(body).toContain("authorized := private.can_currently_read_report(notif.report_id, notif.recipient_id);");
    expect(body).toMatch(/if not authorized then\s*\n\s*update public\.notification_deliveries\s*\n\s*set state = 'permanent_failure', last_error = 'RECIPIENT_NO_LONGER_AUTHORIZED'/);
  });
});

describe("migration source: append-only-ish delivery semantics -- a delivered notification can never be re-delivered merely because a worker retried", () => {
  it("notification_deliveries.state is constrained to exactly five documented values", () => {
    expect(notificationSql).toContain("state text not null default 'pending' check (state in ('pending', 'processing', 'delivered', 'retryable_failure', 'permanent_failure'))");
  });

  it("record_email_delivery_result computes 'delivered' only on success, 'permanent_failure' when the caller says so or attempts are exhausted, otherwise 'retryable_failure' -- no other state is ever assigned", () => {
    const start = notificationSql.indexOf("create or replace function public.record_email_delivery_result(");
    const bodyEnd = notificationSql.indexOf("\n$$;", start);
    const body = notificationSql.slice(start, bodyEnd);
    expect(body).toContain("if p_success then\n    new_state := 'delivered';\n  elsif p_permanent or (current_attempts + 1) >= current_max then\n    new_state := 'permanent_failure';\n  else\n    new_state := 'retryable_failure';\n  end if;");
  });
});

describe("migration source: preferences -- a mandatory category can never be disabled, enforced by the RPC itself, not a UI convention", () => {
  it("notification_preferences constrains category to exactly one configurable value -- report_activity -- bounty_activity has no override row possible", () => {
    expect(notificationSql).toContain("category text not null check (category in ('report_activity'))");
  });

  it("set_notification_preference rejects any category other than report_activity by name with CATEGORY_NOT_CONFIGURABLE", () => {
    const start = notificationSql.indexOf("create or replace function public.set_notification_preference(");
    const bodyEnd = notificationSql.indexOf("\n$$;", start);
    const body = notificationSql.slice(start, bodyEnd);
    expect(body).toMatch(/if p_category <> 'report_activity' then\s*\n\s*raise exception 'CATEGORY_NOT_CONFIGURABLE/);
  });

  it("get_my_notification_preferences hardcodes bounty_activity as email_enabled=true, is_mandatory=true -- never reads notification_preferences for it", () => {
    const start = notificationSql.indexOf("create or replace function public.get_my_notification_preferences(");
    const bodyEnd = notificationSql.indexOf("\n$$;", start);
    const body = notificationSql.slice(start, bodyEnd);
    expect(body).toContain("select 'bounty_activity'::text, true, true;");
  });

  it("set_notification_preference writes an audit_logs row -- a self-service change to security/business-relevant communication preferences is worth a durable trail", () => {
    const start = notificationSql.indexOf("create or replace function public.set_notification_preference(");
    const bodyEnd = notificationSql.indexOf("\n$$;", start);
    const body = notificationSql.slice(start, bodyEnd);
    expect(body).toContain("insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)");
    expect(body).toContain("'notification_preference.updated'");
  });

  it("no routine delivery attempt/retry writes to audit_logs -- only the preference-change RPC does, in this whole migration", () => {
    expect((notificationCodeOnly.match(/insert into public\.audit_logs/g) ?? []).length).toBe(1);
  });
});

describe("migration source: RLS -- notifications has a human reader (its own recipient); notification_deliveries does not (mirrors outbox_events' reasoning)", () => {
  it("notifications RLS policy scopes strictly to recipient_id = auth.uid()", () => {
    expect(notificationSql).toContain('create policy "notifications read by their own recipient" on public.notifications');
    expect(notificationSql).toContain("using (recipient_id = auth.uid());");
  });

  it("notification_deliveries has RLS enabled but defines zero policies -- no authenticated/anon grant exists either", () => {
    expect(notificationSql).toContain("alter table public.notification_deliveries enable row level security;");
    expect(notificationSql).not.toMatch(/create policy[^;]*on public\.notification_deliveries/);
    expect(notificationCodeOnly).not.toMatch(/grant[^;]*on public\.notification_deliveries to (authenticated|anon)/);
  });

  it("notification_preferences RLS policy scopes strictly to user_id = auth.uid(), select-only for authenticated", () => {
    expect(notificationSql).toContain('create policy "notification preferences read by their own user" on public.notification_preferences');
    expect(notificationSql).toContain("using (user_id = auth.uid());");
    expect(notificationCodeOnly).not.toMatch(/grant[^;]*(insert|update|delete)[^;]*on public\.notification_preferences to authenticated/);
  });
});

describe("migration source: client cannot insert a notification, assign a recipient, or mutate delivery state", () => {
  it("route_and_create_notifications/ensure_email_delivery/prepare_notification_email/record_email_delivery_result are revoked from public/authenticated/anon and granted only to service_role", () => {
    for (const [fn, signature] of [
      ["route_and_create_notifications", "uuid, text, uuid, timestamptz"],
      ["ensure_email_delivery", "uuid"],
      ["prepare_notification_email", "uuid"],
      ["record_email_delivery_result", "uuid, boolean, boolean, text, text"],
    ] as const) {
      expect(notificationSql).toContain(`revoke all on function public.${fn}(${signature}) from public, authenticated, anon;`);
      expect(notificationSql).toContain(`grant execute on function public.${fn}(${signature}) to service_role;`);
    }
  });

  it("private.resolve_report_organization_recipients and private.can_currently_read_report are granted to service_role only, never authenticated -- exposing either would make it an arbitrary-user access oracle", () => {
    expect(notificationSql).toContain("grant execute on function private.resolve_report_organization_recipients(uuid) to service_role;");
    expect(notificationSql).not.toMatch(/grant execute on function private\.resolve_report_organization_recipients\(uuid\) to authenticated/);
    expect(notificationSql).toContain("grant execute on function private.can_currently_read_report(uuid, uuid) to service_role;");
    expect(notificationSql).not.toMatch(/grant execute on function private\.can_currently_read_report\(uuid, uuid\) to authenticated/);
  });

  it("mark_notification_read and set_notification_preference/get_my_notification_preferences are security definer and granted to authenticated, re-deriving the actor from auth.uid()", () => {
    for (const fn of ["mark_notification_read", "set_notification_preference", "get_my_notification_preferences"]) {
      const start = notificationSql.indexOf(`create or replace function public.${fn}(`);
      const signatureEnd = notificationSql.indexOf("\nas $$", notificationSql.indexOf("\nlanguage", start));
      const header = notificationSql.slice(start, signatureEnd);
      expect(header).toMatch(/security definer/);
    }
    expect(notificationSql).toContain("grant execute on function public.mark_notification_read(uuid) to authenticated;");
    expect(notificationSql).toContain("grant execute on function public.set_notification_preference(text, boolean) to authenticated;");
    expect(notificationSql).toContain("grant execute on function public.get_my_notification_preferences() to authenticated;");
  });

  it("mark_notification_read takes only a notification id -- no recipient/user id parameter a client could substitute", () => {
    const start = notificationSql.indexOf("create or replace function public.mark_notification_read(");
    const signatureEnd = notificationSql.indexOf("\nreturns", start);
    const signature = notificationSql.slice(start, signatureEnd);
    expect(signature).toBe("create or replace function public.mark_notification_read(p_notification_id uuid)");
  });

  it("no table in this migration grants insert/update/delete to authenticated or anon anywhere", () => {
    expect(notificationCodeOnly).not.toMatch(/grant[^;]*(insert|update|delete)[^;]*to (authenticated|anon)/);
  });
});

describe("migration source: recipient identity is not constrained to the report's researcher_id -- deliberately broader than 0016's reputation_ledger", () => {
  it("notifications has no researcher_id column and no (report_id, researcher_id) composite FK -- recipient_id is an independent, RPC-resolved identity", () => {
    const start = notificationSql.indexOf("create table public.notifications (");
    const end = notificationSql.indexOf(");", start);
    const body = notificationSql.slice(start, end);
    expect(body).not.toContain("researcher_id");
    expect(body).not.toMatch(/report_id, researcher_id\)/);
  });

  it("still ties report_id/program_id/organization_id together via the same composite FK 0016 established -- cross-tenant references remain structurally impossible", () => {
    expect(notificationSql).toContain("foreign key (report_id, program_id, organization_id) references public.reports(id, program_id, organization_id) on delete cascade");
  });
});

describe("migration source: no leaderboard/badge/xp/rank/digest/webhook/slack/teams/push feature added by this migration", () => {
  it("contains no reference to a payment or messaging provider SDK", () => {
    expect(notificationCodeOnly).not.toMatch(/stripe|razorpay|paypal|slack|twilio|sendgrid/i);
  });

  it("defines no function or table named anything like leaderboard/badge/xp/rank/digest/webhook/push", () => {
    expect(notificationSql).not.toMatch(/(function|table) public\.\w*(leaderboard|badge|xp|rank|digest|webhook|push)\w*/i);
  });

  it("in-app delivery has no dedicated delivery row -- only 'email' is a valid channel value in this slice", () => {
    expect(notificationSql).toContain("channel text not null check (channel in ('email'))");
  });
});

describe("migration source: every function in the notification migration pins search_path to ''", () => {
  it("has a matching search_path='' for each `language plpgsql` occurrence", () => {
    const setCount = (notificationCodeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languagePlpgsqlCount = (notificationCodeOnly.match(/language plpgsql/g) ?? []).length;
    expect(setCount).toBe(languagePlpgsqlCount);
  });
});

describe("migration source: zero existing report/triage/bounty RPCs are touched by this migration -- purely additive on the consumption side", () => {
  it("redefines no function that already existed before this migration (submit_report, resolve_report, mark_duplicate, finalize_bounty, etc.)", () => {
    for (const existingFn of ["submit_report", "resolve_report", "mark_duplicate", "mark_informative", "mark_not_applicable", "reject_report", "finalize_bounty", "record_reputation_fact"]) {
      expect(notificationSql).not.toContain(`function public.${existingFn}(`);
    }
  });
});

const hardeningMigrationPath = `${repoRoot}db/migrations/202608290005_production_hardening_foundation.sql`;
const hardeningSql = readFileSync(hardeningMigrationPath, "utf8");
const hardeningCodeOnly = hardeningSql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("migration source: rate limiting is one atomic upsert, not a check-then-increment race", () => {
  it("check_and_consume_rate_limit does a single insert ... on conflict do update ... returning, never a separate select-then-insert/update", () => {
    const start = hardeningSql.indexOf("create or replace function private.check_and_consume_rate_limit(");
    const bodyEnd = hardeningSql.indexOf("\n$$;", start);
    const body = hardeningSql.slice(start, bodyEnd);
    expect(body).not.toMatch(/select .* into .* from private\.rate_limit_counters/i);
    expect(body).toContain("on conflict (bucket_key, window_start) do update set count = private.rate_limit_counters.count + 1");
  });

  it("is granted only to service_role -- never callable directly by authenticated/anon", () => {
    expect(hardeningSql).toContain("revoke all on function private.check_and_consume_rate_limit(text, integer, integer) from public;");
    expect(hardeningSql).toContain("grant execute on function private.check_and_consume_rate_limit(text, integer, integer) to service_role;");
    expect(hardeningSql).not.toMatch(/grant execute on function private\.check_and_consume_rate_limit\([^)]*\) to authenticated/);
  });

  it("check_sign_in_rate_limit is security definer (bridging anon's lack of USAGE on the private schema) and keyed by a normalized email, never revealing whether the account exists", () => {
    const start = hardeningSql.indexOf("create or replace function public.check_sign_in_rate_limit(");
    const bodyEnd = hardeningSql.indexOf("\n$$;", start);
    const header = hardeningSql.slice(start, hardeningSql.indexOf("\nas $$", start));
    const body = hardeningSql.slice(start, bodyEnd);
    expect(header).toMatch(/security definer/);
    expect(body).toContain("'auth_sign_in:' || lower(trim(p_email))");
    expect(body).not.toMatch(/select.*from.*users/i);
  });

  it("check_sign_in_rate_limit is granted to anon (pre-auth) and authenticated, never service_role-only", () => {
    expect(hardeningSql).toContain("grant execute on function public.check_sign_in_rate_limit(text) to anon, authenticated, service_role;");
  });

  it("submit_report's rate limit is keyed by the server-derived actor id, checked before any other logic, and raises a distinct RATE_LIMITED code", () => {
    const start = hardeningSql.indexOf("create or replace function public.submit_report(");
    const bodyEnd = hardeningSql.indexOf("\n$$;", start);
    const body = hardeningSql.slice(start, bodyEnd);
    expect(body).toContain("'report_submit:' || actor::text");
    expect(body).toMatch(/raise exception 'RATE_LIMITED/);
    // The rate-limit check appears before program lookup/authorization -- fail fast.
    expect(body.indexOf("check_and_consume_rate_limit")).toBeLessThan(body.indexOf("PROGRAM_NOT_FOUND"));
  });

  it("create_organization's rate limit is keyed by the server-derived actor id, distinct from (and does not replace) the existing per-creator idempotency key", () => {
    const start = hardeningSql.indexOf("create or replace function public.create_organization(");
    const bodyEnd = hardeningSql.indexOf("\n$$;", start);
    const body = hardeningSql.slice(start, bodyEnd);
    expect(body).toContain("'org_create:' || actor::text");
    expect(body).toContain("idempotency_key = p_idempotency_key"); // the pre-existing replay logic is untouched
  });

  it("neither redefinition changed any pre-existing authorization/validation line", () => {
    expect(hardeningSql).toContain("private.is_researcher_authorized_for_program(target_program_id)");
    expect(hardeningSql).toContain("private.canonicalize_scope_target(p_asset_type, target_input)");
    expect(hardeningSql).toContain("organizations_created_by_idempotency_key_idx");
  });
});

describe("migration source: list_my_reports gains real keyset pagination, backward-compatibly", () => {
  it("explicitly drops the old zero-arg overload before redefining -- otherwise a zero-arg call would keep resolving to the stale, unpaginated version forever", () => {
    const dropIndex = hardeningSql.indexOf("drop function if exists public.list_my_reports();");
    const createIndex = hardeningSql.indexOf("create or replace function public.list_my_reports(\n  p_limit integer default 20,");
    expect(dropIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeGreaterThan(dropIndex);
  });

  it("every new parameter has a default, so an existing zero-arg call still resolves and returns the first page", () => {
    const start = hardeningSql.indexOf("create or replace function public.list_my_reports(\n  p_limit integer default 20,");
    const signatureEnd = hardeningSql.indexOf("\n)\nreturns table", start);
    const signature = hardeningSql.slice(start, signatureEnd);
    expect(signature).toContain("p_limit integer default 20");
    expect(signature).toContain("p_before_submitted_at timestamptz default null");
    expect(signature).toContain("p_before_id uuid default null");
  });

  it("clamps the effective limit into [1, 100] regardless of what is requested", () => {
    const start = hardeningSql.indexOf("create or replace function public.list_my_reports(\n  p_limit integer default 20,");
    const bodyEnd = hardeningSql.indexOf("\n$$;", start);
    const body = hardeningSql.slice(start, bodyEnd);
    expect(body).toContain("least(greatest(coalesce(p_limit, 20), 1), 100)");
  });

  it("orders and filters by the composite (submitted_at, id) tuple -- a real tiebreaker, not a single-column approximation", () => {
    const start = hardeningSql.indexOf("create or replace function public.list_my_reports(\n  p_limit integer default 20,");
    const bodyEnd = hardeningSql.indexOf("\n$$;", start);
    const body = hardeningSql.slice(start, bodyEnd);
    expect(body).toContain("(r.submitted_at, r.id) < (p_before_submitted_at, p_before_id)");
    expect(body).toContain("order by r.submitted_at desc, r.id desc");
  });
});

describe("migration source: no leaderboard/badge/xp/webhook/queue feature added by this migration; no RLS policy touched", () => {
  it("contains no reference to Redis/Kafka/RabbitMQ or a payment/messaging provider SDK", () => {
    expect(hardeningCodeOnly).not.toMatch(/redis|kafka|rabbitmq|stripe|razorpay|paypal/i);
  });

  it("defines no new table other than the rate-limit counter, and touches no existing RLS policy", () => {
    const tableCount = (hardeningSql.match(/^create table /gm) ?? []).length;
    expect(tableCount).toBe(1);
    expect(hardeningSql).not.toMatch(/create policy|drop policy|alter policy/);
  });
});

describe("migration source: every function in the hardening migration pins search_path (where language plpgsql is used)", () => {
  it("has a matching search_path='' for each `language plpgsql` occurrence", () => {
    const setCount = (hardeningCodeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languagePlpgsqlCount = (hardeningCodeOnly.match(/language plpgsql/g) ?? []).length;
    expect(setCount).toBe(languagePlpgsqlCount);
  });
});

const onboardingMigrationPath = `${repoRoot}db/migrations/202608290006_public_onboarding_abuse_hardening.sql`;
const onboardingSql = readFileSync(onboardingMigrationPath, "utf8");
const onboardingCodeOnly = onboardingSql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("migration source: organization/program invitations reuse the existing rate-limit primitive, no second mechanism", () => {
  it("invite_organization_member checks the rate limit immediately after AUTH_REQUIRED, keyed by the server-derived actor, before any authorization/insert logic runs", () => {
    const start = onboardingSql.indexOf("create or replace function public.invite_organization_member(");
    const bodyEnd = onboardingSql.indexOf("\n$$;", start);
    const body = onboardingSql.slice(start, bodyEnd);
    expect(body).toContain("'org_invite:' || actor::text");
    expect(body).toMatch(/raise exception 'RATE_LIMITED/);
    expect(body.indexOf("check_and_consume_rate_limit")).toBeLessThan(body.indexOf("FORBIDDEN: actor cannot invite members"));
  });

  it("invite_researcher_to_program checks the rate limit identically, keyed by the server-derived actor", () => {
    const start = onboardingSql.indexOf("create or replace function public.invite_researcher_to_program(");
    const bodyEnd = onboardingSql.indexOf("\n$$;", start);
    const body = onboardingSql.slice(start, bodyEnd);
    expect(body).toContain("'program_invite:' || actor::text");
    expect(body).toMatch(/raise exception 'RATE_LIMITED/);
  });

  it("neither redefinition changed the pre-existing destination-level protection (the INVITATION_PENDING unique-violation handler) or any authorization/insert/audit line", () => {
    expect(onboardingSql).toContain("INVITATION_PENDING: an invitation is already pending for this email");
    expect((onboardingSql.match(/INVITATION_PENDING: an invitation is already pending for this email/g) ?? []).length).toBe(2);
    expect(onboardingSql).toContain("private.has_org_role(target_org_id, array['owner', 'security_admin']::public.organization_member_role[])");
    expect(onboardingSql).toContain("private.is_program_member(program.id)");
    expect(onboardingSql).toContain("'member.invited'");
    expect(onboardingSql).toContain("'researcher.invited'");
  });

  it("neither RPC's own grants changed -- both remain security definer, no new grant to authenticated added redundantly", () => {
    expect(onboardingSql).not.toMatch(/grant execute on function public\.invite_organization_member/);
    expect(onboardingSql).not.toMatch(/grant execute on function public\.invite_researcher_to_program/);
  });
});

describe("migration source: evidence upload rate limiting is a standalone pre-check RPC, deliberately not folded into either finalize RPC", () => {
  it("check_evidence_upload_rate_limit is security definer, re-derives auth.uid() itself, and is keyed by the actor -- no report/program parameter to trust from the caller", () => {
    const start = onboardingSql.indexOf("create or replace function public.check_evidence_upload_rate_limit(");
    const signature = onboardingSql.slice(start, onboardingSql.indexOf("\nreturns", start));
    expect(signature).toBe("create or replace function public.check_evidence_upload_rate_limit()");
    const header = onboardingSql.slice(start, onboardingSql.indexOf("\nas $$", start));
    expect(header).toMatch(/security definer/);
    const bodyEnd = onboardingSql.indexOf("\n$$;", start);
    const body = onboardingSql.slice(start, bodyEnd);
    expect(body).toContain("'evidence_upload:' || actor::text");
    expect(body).toMatch(/raise exception 'AUTH_REQUIRED/);
  });

  it("is granted to authenticated (every signed-in user may check their own limit), never to anon", () => {
    expect(onboardingSql).toContain("revoke all on function public.check_evidence_upload_rate_limit() from public;");
    expect(onboardingSql).toContain("grant execute on function public.check_evidence_upload_rate_limit() to authenticated;");
    expect(onboardingSql).not.toMatch(/grant execute on function public\.check_evidence_upload_rate_limit\(\) to anon/);
  });

  it("does not redefine add_researcher_file_evidence or add_organization_file_evidence -- the check happens before storage I/O in the TypeScript service layer instead, not inside either finalize RPC", () => {
    expect(onboardingSql).not.toContain("function public.add_researcher_file_evidence(");
    expect(onboardingSql).not.toContain("function public.add_organization_file_evidence(");
  });
});

describe("migration source: reuses the existing rate-limit primitive, adds no second mechanism, no new table", () => {
  it("references private.check_and_consume_rate_limit exactly three times (once per protected action) and defines no new table", () => {
    expect((onboardingCodeOnly.match(/private\.check_and_consume_rate_limit\(/g) ?? []).length).toBe(3);
    expect(onboardingSql).not.toMatch(/^create table /m);
  });

  it("contains no reference to Redis/Kafka/RabbitMQ", () => {
    expect(onboardingCodeOnly).not.toMatch(/redis|kafka|rabbitmq/i);
  });
});

describe("migration source: every function in the onboarding-hardening migration pins search_path", () => {
  it("has a matching search_path='' for each `language plpgsql` occurrence", () => {
    const setCount = (onboardingCodeOnly.match(/search_path\s*=\s*''/g) ?? []).length;
    const languagePlpgsqlCount = (onboardingCodeOnly.match(/language plpgsql/g) ?? []).length;
    expect(setCount).toBe(languagePlpgsqlCount);
  });
});
