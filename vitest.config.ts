import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `server-only` throws unconditionally outside Next's bundler (see
// node_modules/server-only/index.js) -- it relies on Next aliasing it away for
// Client Component bundles, which vitest has no equivalent of. Aliasing it to an
// empty module here lets tests exercise real server-side service code (with the
// Supabase client itself mocked) instead of only the code that avoids importing it.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/mocks/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // A file's first test pays the cold import of next/* server modules: measured up to
    // 3.5s alone on Next 16, and past the 5s default when every file imports in parallel.
    testTimeout: 15_000,
    // Vitest's own default exclude (node_modules, .git, dist, ...) does not know about a
    // background agent's git worktree (.claude/worktrees/<id>/) or a prod build's own copy
    // of the repo under it -- both contain a full tests/unit tree of their own. Confirmed
    // live: an agent worktree left behind after its task finished (a stale server holding
    // a lock on it) caused this exact repo's own suite to double-run and fail against code
    // that was never on this branch. Excluding the whole directory, not just node_modules
    // under it, is the fix that survives any future worktree left in that same spot.
    exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.claude/worktrees/**"],
  },
});
