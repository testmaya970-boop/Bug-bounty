import { globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // supabase/.temp/** is the Supabase CLI's own generated scratch space (bundled Edge
  // Runtime workers, local secrets, etc.) created by `supabase start` -- not source code,
  // never committed (see .gitignore), and not something to lint, same as .next/.
  // .claude/** holds installed agent skills (third-party CommonJS tooling scripts), and
  // partA.mjs is a leftover one-off browser script -- neither is app source.
  globalIgnores([".next/**", ".next-prod/**", ".releases/**", "coverage/**", "playwright-report/**", "next-env.d.ts", "work/npm-cache/**", "supabase/.temp/**", ".claude/**", ".arena/**", "partA.mjs"]),
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: nextPlugin.configs["core-web-vitals"].rules,
  },
);
