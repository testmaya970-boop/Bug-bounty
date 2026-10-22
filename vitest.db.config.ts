import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database tests (tests/db): real Postgres, real RLS, real triggers. Every test runs inside a
// transaction that is always rolled back, so they never change the database and can run
// against the seeded local DB. One file at a time: they share one database.
// Run: npm run test:db   (needs `npm run seed:e2e` once, like the E2E suite)
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
