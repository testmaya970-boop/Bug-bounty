import type { Metadata } from "next";
import { Archivo_Black, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Tactical Telemetry type system (taste-skill:industrial-brutalist-ui): Archivo Black is
// the heavy neo-grotesque for structural headers (one weight -- it is black by design),
// Inter for UI/body text, JetBrains Mono for telemetry metadata. All loaded as CSS
// variables here, once, at the root -- consumed via globals.css's --font-display/
// --font-sans/--font-mono tokens (@theme inline), never re-imported per component.
const archivoBlack = Archivo_Black({ subsets: ["latin"], weight: "400", variable: "--font-display-face", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
// JetBrains Mono: every existing `font-mono` call site (targets, report/org ids, CVSS
// scores, bounty figures) previously fell through to Tailwind's default mono stack, which
// resolves to whatever system monospace font the visitor's OS happens to have -- never a
// deliberate choice. This is a font-loading addition only: it fills the existing
// --font-mono slot in globals.css's @theme block, so every current `font-mono` class
// picks it up automatically with no call-site changes anywhere.
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Unpatched | Security Research Platform",
  description: "A responsible disclosure and vulnerability management platform.",
};

// Forces every route to render per-request rather than be statically prerendered at
// build time. Required now that lib/auth/current-user.ts's getCurrentUser() talks to a
// real Postgres pool via lib/db/pool.ts: at build time there is no request/session, and
// (unlike the old @supabase/ssr client, whose unguarded cookies()/headers() calls
// reliably signalled Next.js to skip static generation for a route) getCurrentUser()
// deliberately catches a thrown headers()/cookies() call so it can also be exercised
// directly in a unit test with no request scope at all -- that same catch was found live
// to suppress Next's own prerendering-bailout signal, so an authenticated page like
// /settings/notifications was prerendered anyway and crashed the build on a real
// AUTH_REQUIRED error with no session to satisfy it. Nearly every route in this app
// already requires a real session in practice (this mirrors how the previous
// middleware-driven cookie read already made almost every page dynamic at runtime under
// Supabase); the handful of genuinely public pages (marketing, sign-in/up, public
// program discovery) lose static optimization here too, which is an accepted tradeoff
// for correctness over the alternative of auditing and annotating every individual route.
export const dynamic = "force-dynamic";

// One substrate (Tactical Telemetry): the palette and color-scheme are set entirely in
// globals.css. The old light/dark ThemeProvider and its pre-paint init script are gone --
// no toggle UI ever consumed them, and the script actively fought the single substrate by
// writing an inline `color-scheme: light` for anyone with a saved "light" preference
// (light native scrollbars and <select> popups on a black page). The `dark` class stays
// static on <html> so any remaining `dark:` utility still resolves the same way everywhere.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${archivoBlack.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
