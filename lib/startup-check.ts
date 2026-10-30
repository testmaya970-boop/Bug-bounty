import { getNativeEnv } from "./env";

/** Set only by playwright.config.ts: the release gate runs a real prod build against the
 * local dev database and local email setup, which legitimately use dev-only values. Counts
 * only on a loopback origin (as sandboxAllowed does), so the flag leaking into a real
 * deployment never switches these checks off. */
function isLocalProdTest(env: NodeJS.ProcessEnv): boolean {
  return env.LOCAL_PROD_TEST === "1" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.APP_ORIGIN ?? "");
}

/**
 * Run once at server start (instrumentation.ts register()): a missing, malformed, or
 * placeholder setting stops the server from starting at all, instead of surfacing as a
 * 500 on whichever request first needs it. Returns the problems so a test can check them.
 */
export function findConfigurationProblems(env: NodeJS.ProcessEnv, isProduction: boolean): string[] {
  const problems: string[] = [];
  try {
    getNativeEnv();
  } catch (error) {
    // zod lists every missing/invalid variable by name, never its value.
    problems.push(`invalid environment: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (isProduction) {
    // Values copied straight from .env.example are a real deploy mistake, not a dev convenience.
    for (const name of ["DATABASE_URL", "SESSION_COOKIE_SECRET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
      if (env[name]?.includes("your-")) problems.push(`${name} still has the .env.example placeholder value`);
    }
    // The committed local-dev credentials (db/init/01-app-role.sql, the old compose file)
    // and the MinIO root user must never reach production.
    if (env.DATABASE_URL?.includes("sentinel_dev_password") && !isLocalProdTest(env)) problems.push("DATABASE_URL still uses the committed local-dev password");
    if (env.S3_SECRET_ACCESS_KEY === "sentinel_dev_password" || env.S3_ACCESS_KEY_ID === "sentinel_minio") {
      problems.push("S3 credentials are the MinIO root/dev credentials -- use a scoped app user (scripts/storage-app-user.sh)");
    }
    if (!env.APP_ORIGIN?.startsWith("https://") && !isLocalProdTest(env)) {
      problems.push("APP_ORIGIN must be an https:// origin in production");
    }
    // The dev provider logs instead of sending but reports success, so notification
    // deliveries would be recorded as "delivered" while nobody receives anything.
    if ((env.EMAIL_PROVIDER ?? "dev") === "dev" && !isLocalProdTest(env)) {
      problems.push("EMAIL_PROVIDER is unset or 'dev' -- no email would actually be sent");
    }
  }
  return problems;
}

/** The public dev-only KYC/payout encryption key (db/init/01-app-role.sql). Production must
 * configure its own secret via `alter database ... set app.settings.kyc_encryption_key`. */
export const DEV_KYC_ENCRYPTION_KEY = "sentinel-local-dev-only-insecure-key-do-not-use-in-production";

export function findKycEncryptionKeyProblem(key: string | null | undefined): string | null {
  if (!key) return "app.settings.kyc_encryption_key is not set on the database";
  if (key === DEV_KYC_ENCRYPTION_KEY) return "app.settings.kyc_encryption_key is still the public local-dev key";
  return null;
}

/** Production only: the encryption key lives in the database, so it can only be checked by
 * asking it. Same exit-don't-throw reasoning as exitOnConfigurationProblems below. */
export async function exitOnDatabaseConfigurationProblems(): Promise<void> {
  if (process.env.NODE_ENV !== "production" || isLocalProdTest(process.env)) return;
  const { withClient } = await import("./db/pool");
  const settings = await withClient(async (client) => {
    const { rows } = await client.query<{ key: string | null; demo: string | null }>(
      "select current_setting('app.settings.kyc_encryption_key', true) as key, current_setting('app.settings.demo_accounts', true) as demo",
    );
    return rows[0];
  });
  const problems = [findKycEncryptionKeyProblem(settings?.key), findDemoAccountsProblem(settings?.demo)].filter((p): p is string => p !== null);
  if (problems.length === 0) return;
  console.error(`Refusing to start -- fix the database configuration:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}

/** Demo accounts (202610290012) skip identity and scope-ownership proof: development only. */
export function findDemoAccountsProblem(setting: string | null | undefined): string | null {
  return setting === "on" ? "app.settings.demo_accounts is on: demo accounts are for development databases only (alter database ... reset app.settings.demo_accounts)" : null;
}

/** Node-only (imported from instrumentation.ts register() behind a NEXT_RUNTIME check).
 * Exits rather than throws: a thrown error there leaves `next start` alive but serving
 * nothing (verified), which a process manager would count as healthy. */
export function exitOnConfigurationProblems(): void {
  const problems = findConfigurationProblems(process.env, process.env.NODE_ENV === "production");
  if (problems.length === 0) return;
  console.error(`Refusing to start -- fix the environment:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
