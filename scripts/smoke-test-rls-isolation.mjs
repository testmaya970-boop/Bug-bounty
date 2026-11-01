import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function run() {
  await client.query("begin");
  await client.query("select set_config('app.current_claims', '{}', true)");

  const { rows: [userA] } = await client.query("select * from public.create_user($1, $2, $3, $4)", ["rls-a@example.com", "x", "A", null]);
  const { rows: [userB] } = await client.query("select * from public.create_user($1, $2, $3, $4)", ["rls-b@example.com", "x", "B", null]);
  // Only organization accounts may create an organization (202609280002).
  await client.query("set local role service_role");
  await client.query("update public.users set account_type = 'organization' where id = $1", [userA.id]);

  // Act as A: create an org.
  await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: userA.id, role: "authenticated" })]);
  await client.query("set local role authenticated");
  const { rows: [org] } = await client.query("select * from public.create_organization($1, $2)", ["A's Org", userA.id]);
  console.log("A created org:", org.id);

  // Act as B: must NOT see A's org via plain RLS-scoped select.
  await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: userB.id, role: "authenticated" })]);
  await client.query("set local role authenticated");
  const { rows: visibleToB } = await client.query("select id from public.organizations where id = $1", [org.id]);

  if (visibleToB.length !== 0) {
    throw new Error(`RLS ISOLATION FAILURE: user B could see user A's organization (${visibleToB.length} row(s) returned)`);
  }
  console.log("B cannot see A's org (RLS isolation confirmed):", visibleToB.length, "row(s)");

  await client.query("rollback");
  console.log("\nRLS ISOLATION TEST PASSED (rolled back, no data persisted)");
}

run()
  .catch((e) => {
    console.error("RLS ISOLATION TEST FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
