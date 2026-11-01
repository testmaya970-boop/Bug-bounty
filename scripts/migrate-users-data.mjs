// Phase 1 data migration: auth.users -> public.users reconciliation. GoTrue's password
// hashes are never exposed via any API/export, so there is no way to carry them over --
// every migrated user gets a placeholder password_hash that can never successfully verify,
// forcing a real password-reset flow on first native-stack sign-in. This is a disclosed,
// unavoidable consequence (see the migration plan), not a defect.
import pg from "pg";
import argon2 from "argon2";

const sourceUrl = process.env.SUPABASE_DB_URL;
const targetUrl = process.env.DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  console.error("SUPABASE_DB_URL and DATABASE_URL are both required");
  process.exit(1);
}

const source = new pg.Client({ connectionString: sourceUrl });
const target = new pg.Client({ connectionString: targetUrl });
await source.connect();
await target.connect();

// A random, never-guessable value hashed once and reused for every migrated row --
// nobody can sign in with it (it's not derived from anything a real user could know),
// which is the point: the only real path in is the forced password-reset flow.
const unusableHash = await argon2.hash(`migration-forced-reset-${crypto.randomUUID()}`);

const { rows: authUsers } = await source.query(
  `select u.id, u.email, u.email_confirmed_at, u.created_at
   from auth.users u`,
);
const { rows: profileRows } = await source.query(
  `select id, username, display_name, platform_role, is_suspended, created_at, updated_at, email as profile_email
   from public.users`,
);
const profileById = new Map(profileRows.map((r) => [r.id, r]));

let migrated = 0;
for (const authUser of authUsers) {
  const profile = profileById.get(authUser.id);
  if (!profile) {
    console.warn(`skipping ${authUser.id} (${authUser.email}): no matching public.users row`);
    continue;
  }
  await target.query(
    `insert into public.users (id, username, display_name, password_hash, must_reset_password, email, email_verified_at, platform_role, is_suspended, created_at, updated_at)
     values ($1, $2, $3, $4, true, $5, $6, $7, $8, $9, $10)
     on conflict (id) do nothing`,
    [
      authUser.id,
      profile.username,
      profile.display_name,
      unusableHash,
      profile.profile_email ?? authUser.email?.toLowerCase() ?? null,
      authUser.email_confirmed_at,
      profile.platform_role,
      profile.is_suspended,
      profile.created_at,
      profile.updated_at,
    ],
  );
  migrated++;
}

console.log(`Migrated ${migrated}/${authUsers.length} users. Every migrated account requires a forced password reset before first sign-in.`);

await source.end();
await target.end();
