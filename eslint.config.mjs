import { globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // supabase/.temp/** is the Supabase CLI's own generated scratch space (bundled Edge
  // Runtime workers, local secrets, etc.) created by `supabase start` -- not source code,
  // never committed (see .gitignore), and not something to lint, same as .next/.
  globalIgnores([".next/**", "coverage/**", "playwright-report/**", "next-env.d.ts", "work/npm-cache/**", "supabase/.temp/**"]),
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: nextPlugin.configs["core-web-vitals"].rules,
  },
);
