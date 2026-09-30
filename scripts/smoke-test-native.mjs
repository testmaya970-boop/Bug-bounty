import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function run() {
  await client.query("begin");
  await client.query("select set_config('app.current_claims', '{}', true)");

  const { rows: [user] } = await client.query(
    "select * from public.create_user($1, $2, $3, $4)",
    ["smoke-test@example.com", "argon2-hash-placeholder", "Smoke Test", null],
  );
  console.log("created user:", user.id, user.username, user.email);
  // Only organization accounts may create an organization (202609280002).
  await client.query("set local role service_role");
  await client.query("update public.users set account_type = 'organization' where id = $1", [user.id]);

  // Now act as that user via the auth.uid() shim.
  await client.query("select set_config('app.current_claims', $1, true)", [
    JSON.stringify({ sub: user.id, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");

  const { rows: [self] } = await client.query("select id, username from public.users where id = auth.uid()");
  console.log("auth.uid() self-read via RLS:", self);

  const { rows: [org] } = await client.query("select * from public.create_organization($1, $2)", ["Smoke Test Org", user.id]);
  console.log("created org:", org.id, org.name);

  const { rows: orgs } = await client.query("select id, name from public.organizations");
  console.log("organizations visible under RLS as creator:", orgs.length, "row(s)");

  await client.query("rollback");
  console.log("\nSMOKE TEST PASSED (rolled back, no data persisted)");
}

run()
  .catch((e) => {
    console.error("SMOKE TEST FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
