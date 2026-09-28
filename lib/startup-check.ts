import { getNativeEnv } from "./env";

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
  }
  return problems;
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
