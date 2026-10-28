import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fixture, inTx, newUser, userId, type Db } from "./db";

// 202610290006/0007: SAML SSO and SCIM provisioning rules, enforced in the database.

const CERT = "-----BEGIN CERTIFICATE-----\n" + "A".repeat(200) + "\n-----END CERTIFICATE-----";

async function setup(db: Db, domain: string) {
  const owner = await userId(db, "e2e.admin@unpatched.demo");
  await db.query("reset role");
  await db.query("insert into public.organization_domains (organization_id, domain, status, verified_at) values ($1, $2, 'verified', now())", [fixture.organizationId, domain]);
  await db.as({ user: owner });
  const id = (await db.one<{ id: string }>("select public.save_sso_connection($1, 'https://idp.example', 'https://idp.example/sso', $2, true, 'triager', 'groups', '{\"sec\":\"security_admin\"}'::jsonb) as id", [fixture.organizationId, CERT])).id;
  await db.query("select public.set_sso_state($1, true, false)", [fixture.organizationId]);
  return { owner, connection: id };
}

async function orgAccount(db: Db, email: string): Promise<string> {
  await db.query("reset role");
  const u = await db.one<{ id: string }>("select id from public.create_user($1, 'x', null, null)", [email]);
  await db.query("update public.users set account_type = 'organization', email_verified_at = now() where id = $1", [u.id]);
  return u.id;
}

describe("single sign-on", () => {
  it("only org admins configure it; owner is never a mappable role; it needs a verified domain", async () => {
    await inTx(async (db) => {
      const triager = await userId(db, "e2e.triager@unpatched.demo");
      await db.as({ user: triager });
      expect(await db.fails("select public.save_sso_connection($1, 'x', 'https://x', $2, true, 'triager', null, '{}'::jsonb)", [fixture.organizationId, CERT])).toMatch(/FORBIDDEN/);
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      await db.as({ user: owner });
      expect(await db.fails("select public.save_sso_connection($1, 'x', 'https://x', $2, true, 'owner', null, '{}'::jsonb)", [fixture.organizationId, CERT])).toMatch(/owner|violates/);
      expect(await db.fails("select public.save_sso_connection($1, 'x', 'https://x', $2, true, 'triager', 'groups', '{\"g\":\"owner\"}'::jsonb)", [fixture.organizationId, CERT])).toMatch(/INVALID_ROLE/);
      await db.query("select public.save_sso_connection($1, 'x', 'https://x', $2, true, 'triager', null, '{}'::jsonb)", [fixture.organizationId, CERT]);
      await db.query("reset role");
      await db.query("delete from public.organization_domains where organization_id = $1", [fixture.organizationId]);
      await db.as({ user: owner });
      expect(await db.fails("select public.set_sso_state($1, true, false)", [fixture.organizationId])).toMatch(/DOMAIN_REQUIRED/);
    });
  });

  it("provisions on a verified domain, maps roles, refuses researchers and other domains", async () => {
    await inTx(async (db) => {
      const domain = `sso-${randomUUID().slice(0, 8)}.example`;
      const { connection } = await setup(db, domain);
      const person = await orgAccount(db, `dev@${domain}`);
      await db.as("service");
      expect(await db.fails("select private.sso_provision_member($1, $2, 'n1', null, null, null, 'saml')", [connection, "dev@not-verified.example"])).toMatch(/SSO_DOMAIN/);
      const linked = await db.one<{ sso_provision_member: string }>("select private.sso_provision_member($1, $2, 'n1', null, 'security_admin', null, 'saml')", [connection, `dev@${domain}`]);
      expect(linked.sso_provision_member).toBe(person);
      const m = await db.one<{ role: string; status: string }>("select role, status from public.organization_members where organization_id = $1 and user_id = $2", [fixture.organizationId, person]);
      expect(m).toMatchObject({ role: "security_admin", status: "active" });
      // Never owner, even if an IdP maps to it.
      await db.query("select private.sso_provision_member($1, $2, 'n1', null, 'owner', null, 'saml')", [connection, `dev@${domain}`]);
      expect((await db.one<{ role: string }>("select role from public.organization_members where organization_id = $1 and user_id = $2", [fixture.organizationId, person])).role).not.toBe("owner");

      // A researcher account on the verified domain is refused (two-sided accounts).
      const researcher = await newUser(db, "researcher");
      await db.query("reset role");
      await db.query("update public.users set email = $2 where id = $1", [researcher, `hunter@${domain}`]);
      await db.as("service");
      expect(await db.fails("select private.sso_provision_member($1, $2, 'n2', null, null, null, 'saml')", [connection, `hunter@${domain}`])).toMatch(/SSO_RESEARCHER_ACCOUNT/);
    });
  });

  it("enforcement blocks passwords for members but never for owners; SCIM deprovisioning ends sessions", async () => {
    await inTx(async (db) => {
      const domain = `sso-${randomUUID().slice(0, 8)}.example`;
      const { owner, connection } = await setup(db, domain);
      const person = await orgAccount(db, `ops@${domain}`);
      await db.as("service");
      await db.query("select private.sso_provision_member($1, $2, null, null, null, null, 'scim')", [connection, `ops@${domain}`]);
      expect((await db.one<{ b: boolean }>("select private.password_sign_in_blocked($1) as b", [person])).b).toBe(false);
      await db.as({ user: owner });
      await db.query("select public.set_sso_state($1, true, true)", [fixture.organizationId]);
      await db.as("service");
      expect((await db.one<{ b: boolean }>("select private.password_sign_in_blocked($1) as b", [person])).b).toBe(true);
      // Make the owner's email sit on the domain too: still never blocked.
      await db.query("reset role");
      const ownerEmail = (await db.one<{ email: string }>("select email from public.users where id = $1", [owner])).email;
      await db.query("update public.users set email = $2 where id = $1", [owner, `boss@${domain}`]);
      await db.as("service");
      expect((await db.one<{ b: boolean }>("select private.password_sign_in_blocked($1) as b", [owner])).b).toBe(false);
      await db.query("reset role");
      await db.query("update public.users set email = $2 where id = $1", [owner, ownerEmail]);

      await db.query("insert into public.sessions (id, user_id, token_hash, aal) values ($1, $2, $3, 'aal1')", [randomUUID(), person, `t-${randomUUID()}`]);
      await db.as("service");
      await db.query("select private.scim_set_active($1, $2, false)", [connection, person]);
      await db.query("reset role");
      expect((await db.one<{ status: string }>("select status from public.organization_members where organization_id = $1 and user_id = $2", [fixture.organizationId, person])).status).toBe("suspended");
      expect(await db.rows("select id from public.sessions where user_id = $1", [person])).toHaveLength(0);
      await db.as("service");
      expect(await db.fails("select private.scim_set_active($1, $2, false)", [connection, owner])).toMatch(/SCIM_OWNER/);
      // A suspended member can't sign in through SSO either.
      expect(await db.fails("select private.sso_provision_member($1, $2, 'n9', null, null, null, 'saml')", [connection, `ops@${domain}`])).toMatch(/SSO_SUSPENDED/);
    });
  });
});
