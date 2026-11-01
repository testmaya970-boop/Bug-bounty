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
const devTunnelHosts = isDev ? ["*.devtunnels.ms", "*.ngrok-free.app", "*.ngrok.app", "*.trycloudflare.com", "*.run.app"] : ["*.run.app"];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  compress: process.env.NEXT_COMPRESS === "1",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  transpilePackages: ["motion", "animejs"],
  allowedDevOrigins: ["127.0.0.1", "localhost", ...lanAddresses, ...devTunnelHosts],
  experimental: {
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
        `localhost:${devPort}`,
        `127.0.0.1:${devPort}`,
      ],
    },
  },
  webpack: (config, { dev }) => {
    if (dev && process.env.DISABLE_HMR === "true") {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/v1/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "Vary", value: "Cookie, Authorization" }] },
    ];
  },
};

export default nextConfig;
