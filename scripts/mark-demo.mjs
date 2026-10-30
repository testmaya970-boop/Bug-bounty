// Marks accounts and organizations as demo in a DEVELOPMENT database (202610290012): demo
// researchers count as identity-verified; demo organizations' scope needs no ownership proof.
//
//   npm run demo:mark -- researcher@example.com another@example.com
//   npm run demo:mark -- --org owner@company.com        (every organization this person owns)
//
// Refuses unless the database has demo accounts switched on, and unless APP_ORIGIN is local,
// so it can't be pointed at a real deployment by mistake.
import pg from "pg";

const origin = process.env.APP_ORIGIN ?? "";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
  console.error(`Refusing: APP_ORIGIN (${origin || "unset"}) is not a local address. Demo accounts are for development only.`);
  process.exit(1);
}
const args = process.argv.slice(2);
const userEmails = [];
const orgOwnerEmails = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--org") orgOwnerEmails.push(args[++i]);
  else userEmails.push(args[i]);
}
if (!userEmails.length && !orgOwnerEmails.length) {
  console.error("Usage: npm run demo:mark -- <researcher email>... [--org <owner email>]...");
  process.exit(1);
}

const db = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
await db.connect();
try {
  const orgs = orgOwnerEmails.length
    ? (
        await db.query(
          `select o.id, o.name from public.organizations o join public.organization_members m on m.organization_id = o.id and m.role = 'owner' and m.status = 'active'
           join public.users u on u.id = m.user_id where lower(u.email) = any ($1)`,
          [orgOwnerEmails.map((e) => e.toLowerCase())],
        )
      ).rows
    : [];
  await db.query("select public.set_demo_flags($1, $2)", [userEmails, orgs.map((o) => o.id)]);
  const marked = (await db.query("select email from public.users where is_demo and lower(email) = any ($1)", [userEmails.map((e) => e.toLowerCase())])).rows;
  for (const u of marked) console.log(`Demo researcher: ${u.email}`);
  for (const e of userEmails.filter((e) => !marked.some((m) => m.email.toLowerCase() === e.toLowerCase()))) console.log(`No account for ${e}`);
  for (const o of orgs) console.log(`Demo organization: ${o.name}`);
  if (orgOwnerEmails.length && !orgs.length) console.log("No organization owned by those emails.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
