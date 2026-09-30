import type { NextConfig } from "next";

/**
 * Static security headers for every response -- see
 * docs/decisions/0018-production-hardening-and-integration-boundary.md. The
 * Content-Security-Policy is NOT here: it is per-request (a fresh script nonce each
 * time), set by proxy.ts via lib/security/csp.ts, and includes frame-ancestors 'none'.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Lets the E2E release gate build into its own folder (playwright.config.ts sets
  // NEXT_DIST_DIR=.next-prod) so a production build never overwrites a running dev
  // server's .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
