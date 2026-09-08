import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/session/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Node.js runtime, not the Edge default: lib/session/middleware.ts validates the session
// cookie via a real `pg` (node-postgres) connection, a raw TCP client that cannot run on
// Vercel's Edge runtime at all -- unlike the old @supabase/ssr-based middleware, which
// worked on Edge because it spoke HTTP. See the migration plan's own note on this exact
// constraint.
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
