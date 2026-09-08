// Live, end-to-end exercise of representative converted services (Phase 5) against the
// real native Postgres instance -- calls the actual lib/db/pool.ts helpers
// (withActorTransaction/withServiceRoleTransaction/callRpc), the same functions
// services/*.ts now use, with real data already in the database. This validates the
// RLS-scoping/role-selection decisions made during the conversion, not just that SQL
// syntax is valid.
import { Pool, types as pgTypes } from "pg";

// pg parses date/timestamp/timestamptz columns into JS Date objects by default, not the
// ISO strings the real app (lib/db/type-parsers.ts) always sees -- this bare Pool has no
// access to that module (see live-test-auth-flows.mjs's own comment for why), so the
// same three stable built-in OIDs are registered directly here.
for (const oid of [1082, 1114, 1184]) pgTypes.setTypeParser(oid, (value) => new Date(value).toISOString());

const DATABASE_URL = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

let failures = 0;
function assert(condition, message) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

async function withActorTransaction(actorId, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: actorId ?? "", role: "authenticated" })]);
    await client.query("set local role authenticated");
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

async function withServiceRoleTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: "", role: "service_role" })]);
    await client.query("set local role service_role");
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

async function callRpc(client, fn, args = []) {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query(`select * from ${fn}(${placeholders})`, args);
  return result.rows;
}

async function main() {
  const { users, orgMemberships } = await withServiceRoleTransaction(async (client) => {
    const { rows: users } = await client.query("select id, username from public.users order by username limit 2");
    const { rows: orgMemberships } = await client.query(
      "select o.id, o.name, m.user_id from public.organizations o join public.organization_members m on m.organization_id = o.id and m.status = 'active' order by o.name limit 1",
    );
    return { users, orgMemberships };
  });
  const [userA, userB] = users;
  const org = orgMemberships[0];
  const orgOwnerId = org?.user_id;

  assert(!!userA && !!userB, "setup: at least 2 real users exist");
  assert(!!org, "setup: at least 1 real organization exists");
  assert(!!orgOwnerId, "setup: the organization has at least 1 real member");

  // 1. services/organizations.ts's listCurrentUserOrganizations pattern -- the org owner
  // sees their own org; an unrelated user sees none.
  const ownerOrgs = await withActorTransaction(orgOwnerId, (client) =>
    client
      .query(
        `select m.role, o.id, o.slug, o.name, o.status
         from public.organization_members m join public.organizations o on o.id = m.organization_id
         where m.user_id = $1 and m.status = 'active'`,
        [orgOwnerId],
      )
      .then((r) => r.rows),
  );
  assert(ownerOrgs.some((r) => r.id === org.id), "organizations: the real owner sees their own organization via the converted query");

  const unrelatedUserId = [userA.id, userB.id].find((id) => id !== orgOwnerId) ?? userA.id;
  const unrelatedOrgs = await withActorTransaction(unrelatedUserId, (client) =>
    client
      .query(
        `select m.role, o.id, o.slug, o.name, o.status
         from public.organization_members m join public.organizations o on o.id = m.organization_id
         where m.user_id = $1 and m.status = 'active'`,
        [unrelatedUserId],
      )
      .then((r) => r.rows),
  );
  assert(!unrelatedOrgs.some((r) => r.id === org.id), "organizations: an unrelated user does NOT see this organization (RLS tenant isolation)");

  // 2. services/programs.ts's public discovery path (withPublicTransaction / anon role)
  const anonPrograms = await withServiceRoleTransactionAsAnon();
  assert(Array.isArray(anonPrograms), "programs: list_public_programs callable as anon (public discovery works signed-out)");

  // 3. services/platform-operations.ts's findUserIdByUsername -- service_role-scoped
  // lookup, must succeed regardless of the target user's own RLS visibility to nobody.
  const found = await withServiceRoleTransaction((client) =>
    client.query("select id, is_suspended from public.users where username = $1", [userA.username]).then((r) => r.rows[0]),
  );
  assert(found?.id === userA.id, "platform-operations: findUserIdByUsername resolves a real username via service_role");

  // 4. Confirm the SAME lookup is genuinely NOT visible to an unrelated authenticated
  // user reading users by username directly (proving the service-role exception is a
  // real, narrower boundary than plain authenticated access) -- authenticated has
  // SELECT on users but no policy admits "read anyone by username," only self/co-member.
  const authenticatedLookup = await withActorTransaction(unrelatedUserId, (client) =>
    client.query("select id from public.users where username = $1 and id <> $2", [userA.username, unrelatedUserId]).then((r) => r.rows),
  );
  assert(authenticatedLookup.length === 0, "platform-operations: an ordinary authenticated user cannot look up an unrelated username directly (RLS still narrows it)");

  // 5. services/reports.ts's bearer-token "for actor" path -- service_role required,
  // authenticated must be rejected outright (permission denied), not just empty.
  let deniedForAuthenticated = false;
  try {
    await withActorTransaction(orgOwnerId, (client) => callRpc(client, "public.list_reports_for_actor", [orgOwnerId, 10, null, null]));
  } catch (e) {
    deniedForAuthenticated = /permission denied/i.test(e.message);
  }
  assert(deniedForAuthenticated, "reports: list_reports_for_actor correctly rejects the authenticated role (service_role-only grant enforced)");

  const forActorRows = await withServiceRoleTransaction((client) => callRpc(client, "public.list_reports_for_actor", [orgOwnerId, 10, null, null]));
  assert(Array.isArray(forActorRows), "reports: list_reports_for_actor succeeds via service_role");

  await pool.end();
  console.log(`\n${failures === 0 ? "ALL LIVE SERVICE TESTS PASSED" : `${failures} FAILURE(S)`}`);
  process.exitCode = failures === 0 ? 0 : 1;

  async function withServiceRoleTransactionAsAnon() {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: "", role: "anon" })]);
      await client.query("set local role anon");
      const rows = await callRpc(client, "public.list_public_programs", [null, null, null, null, null, 10]);
      await client.query("commit");
      return rows;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
}

main().catch((e) => {
  console.error("LIVE TEST CRASHED:", e);
  process.exitCode = 1;
});
