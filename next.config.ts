import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/**
 * Development only: opening `next dev` on a phone goes through this machine's LAN address or a
 * dev tunnel (VS Code port forwarding, ngrok, Cloudflare quick tunnels). A tunnel hands the
 * request to the server as localhost while the phone's Origin is the tunnel's host, so Next's
 * Server Actions CSRF check refused every form ("Invalid Server Actions request"), and the dev
 * server also blocked its own scripts for the unknown origin. These are allowed in development
 * only; a production build keeps the strict same-origin check (SERVER_ACTIONS_ALLOWED_ORIGINS
 * remains the explicit opt-in there).
 */
const isDev = process.env.NODE_ENV !== "production";
const devPort = process.env.PORT ?? "3000";
const lanAddresses = isDev
  ? Object.values(networkInterfaces())
      .flat()
      .filter((a): a is NonNullable<typeof a> => Boolean(a && a.family === "IPv4" && !a.internal))
      .map((a) => a.address)
  : [];
const devTunnelHosts = isDev ? ["*.devtunnels.ms", "*.ngrok-free.app", "*.ngrok.app", "*.trycloudflare.com"] : [];

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
  // HTTPS deployments only: browsers ignore it over http, and pinning localhost would break dev.
  ...(process.env.NODE_ENV === "production" && process.env.APP_ORIGIN?.startsWith("https://")
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // Lets the E2E release gate build into its own folder (playwright.config.ts sets
  // NEXT_DIST_DIR=.next-prod) so a production build never overwrites a running dev
  // server's .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // Compression belongs to the TLS front (nginx/CDN). Node-side gzip stalled responses under
  // load ("11 drain listeners added to [Gzip]", then 50-100s hung page loads in E2E).
  compress: process.env.NEXT_COMPRESS === "1",
  typedRoutes: true,
  allowedDevOrigins: ["127.0.0.1", "localhost", ...lanAddresses, ...devTunnelHosts],
  // Evidence file uploads go through a Server Action (actions/report-file-evidence.ts).
  // The application's own 10 MiB evidence size limit (see
  // docs/decisions/0011-binary-evidence-storage.md) is the one a user actually sees
  // enforced; this just needs enough headroom for multipart overhead plus that limit.
  //
  // allowedOrigins: Server Actions refuse a request whose Origin differs from its
  // (forwarded) host -- Next's CSRF check. A reverse proxy or dev tunnel that rewrites
  // Origin (e.g. a VS Code dev tunnel sends Origin: localhost:3100 with the tunnel's
  // x-forwarded-host) fails it on every form. SERVER_ACTIONS_ALLOWED_ORIGINS (comma
  // separated, e.g. "localhost:3100") opts specific origins in; unset in production, so
  // the check stays strict. Safe to list a local origin: a browser always sends the true
  // origin of the page making the request, so another site can't claim it.
  experimental: {
    // Phosphor isn't on Next's default list; without this a named import loads all ~1,500 icons.
    optimizePackageImports: ["@phosphor-icons/react"],
    serverActions: {
      bodySizeLimit: "12mb",
      allowedOrigins: [
        ...(process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
        ...lanAddresses.map((address) => `${address}:${devPort}`),
        ...devTunnelHosts,
      ],
    },
  },
  async headers() {
    // Applied to every response this Next.js app itself serves. Evidence downloads are
    // NOT affected: those are presigned S3/MinIO URLs served directly by the object
    // store, an entirely separate origin these headers never touch.
    return [
      { source: "/:path*", headers: securityHeaders },
      // The JSON API answers per user (session cookie or Bearer token); no browser or shared
      // proxy may store it or serve it to someone else. Pages already get no-store as dynamic.
      { source: "/api/v1/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "Vary", value: "Cookie, Authorization" }] },
    ];
  },
};

export default nextConfig;
