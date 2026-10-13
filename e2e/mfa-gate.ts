import type { Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Platform admins must pass MFA (db/migrations/202610100001). Specs clear the sign-in MFA
// gate the way a person with saved backup codes would: a fresh single-use backup code is
// stored for the account, then typed into the real /mfa/verify form. A minted code per
// sign-in (rather than one TOTP code) keeps parallel workers from replaying each other's.

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const match = /^DATABASE_URL=(.+)$/m.exec(readFileSync(path.join(process.cwd(), ".env.local"), "utf-8"));
  if (!match) throw new Error("DATABASE_URL not found");
  return match[1].trim();
}

async function mintBackupCode(email: string): Promise<string> {
  const code = randomBytes(5).toString("hex").toUpperCase();
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    const { rowCount } = await client.query("insert into public.mfa_backup_codes (user_id, code_hash) select id, $2 from public.users where email = $1", [
      email,
      createHash("sha256").update(code).digest("hex"),
    ]);
    await client.query("commit");
    if (rowCount !== 1) throw new Error(`no account for ${email}`);
    return code;
  } finally {
    await client.end();
  }
}

/** Call right after submitting the sign-in form. Does nothing unless the account was sent to /mfa/verify. */
export async function passMfaGate(page: Page, email: string): Promise<void> {
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  if (!new URL(page.url()).pathname.startsWith("/mfa/verify")) return;
  const code = await mintBackupCode(email);
  await page.getByRole("button", { name: "Use a backup code instead" }).click();
  await page.getByLabel("Backup code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/mfa/verify"));
}
