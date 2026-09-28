/**
 * The app's Content-Security-Policy, built per request around a fresh nonce (proxy.ts).
 * Next.js reads the nonce back out of the request's CSP header and stamps it on its own
 * framework/page scripts, so no component passes it around. Every page is dynamically
 * rendered (app/layout.tsx `force-dynamic`), which nonces require.
 *
 * - script-src: nonce + 'strict-dynamic' only. No 'unsafe-inline' -- an injected <script>
 *   or inline handler cannot run. 'unsafe-eval' in development only (React dev tooling).
 * - style-src allows 'unsafe-inline' on purpose: React server-renders style="" attributes
 *   and the animation libraries inject styles at runtime, which a nonce cannot cover (a
 *   nonce in style-src also disables 'unsafe-inline'). Style injection is far lower risk
 *   than script injection; scripts are where this policy spends its strictness.
 * - fonts.googleapis.com / fonts.gstatic.com: components/marketing/vanguard-showcase.tsx
 *   loads its display faces from Google Fonts at runtime. next/font faces are self-hosted.
 * - No upgrade-insecure-requests: it would break the plain-http local/E2E server. Add it
 *   (with HSTS) where TLS terminates, in the deployment layer.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' blob: data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
