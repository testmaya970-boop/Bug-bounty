import type { NextConfig } from "next";

/**
 * A conservative, verified-not-to-break-anything header set -- see
 * docs/decisions/0018-production-hardening-and-integration-boundary.md for what was
 * tested (sign-in, evidence signed downloads, Next.js's own dev-mode assets) and why a
 * strict `script-src`/nonce-based CSP was deliberately NOT attempted here: Next.js's own
 * inline hydration scripts and React Server Components' streaming payload need either
 * `'unsafe-inline'` (defeating the point of a strict CSP) or a per-request nonce
 * threaded through every layout (a real, separately-scoped change this hardening slice
 * does not rush into). `frame-ancestors 'none'` alone already closes the concrete
 * clickjacking risk without needing the rest of a strict CSP to be correct first.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Evidence file uploads go through a Server Action (actions/report-file-evidence.ts).
  // The application's own 10 MiB evidence size limit (see
  // docs/decisions/0011-binary-evidence-storage.md) is the one a user actually sees
  // enforced; this just needs enough headroom for multipart overhead plus that limit.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    // Applied to every response this Next.js app itself serves. Evidence downloads are
    // NOT affected: those are presigned S3/MinIO URLs served directly by the object
    // store, an entirely separate origin these headers never touch.
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
