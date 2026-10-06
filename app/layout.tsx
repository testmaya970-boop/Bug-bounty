import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, JetBrains_Mono, Open_Sans } from "next/font/google";
import "./globals.css";
import { ClientErrorListener } from "../components/client-error-listener";
import { TimeZoneProvider } from "../components/ui/local-time";
import { TIME_ZONE_COOKIE, isValidTimeZone } from "../lib/format-date";

// Netras type system (netras.ai's own Google Fonts link): Inter 600/700/800 for headings,
// Open Sans 400-700 for body/UI, plus JetBrains Mono for code/data. All loaded as CSS
// variables here, once, at the root -- consumed via globals.css's --font-display/
// --font-sans/--font-mono tokens (@theme inline), never re-imported per component.
const inter = Inter({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-inter", display: "swap" });
const openSans = Open_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-open-sans", display: "swap" });
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

// One theme (Netras light): the palette and color-scheme are set entirely in globals.css.
// The old light/dark ThemeProvider and its pre-paint init script are gone. The `dark`
// class stays static on <html> for anything that still targets it, but globals.css
// resolves it to the same light palette -- there is no dark mode.
// The viewer's time zone for every timestamp (components/ui/local-time.tsx): reported by
// the browser in a cookie, validated here -- it is client-controlled -- before any render
// hands it to Intl. A request cookie read, not a data fetch.
async function viewerTimeZone(): Promise<string | null> {
  const raw = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
  if (!raw) return null;
  let zone = raw;
  try {
    zone = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return isValidTimeZone(zone) ? zone : null;
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const timeZone = await viewerTimeZone();
  return (
    <html lang="en" className={`dark ${inter.variable} ${openSans.variable} ${jetbrainsMono.variable}`}>
      <body>
        <TimeZoneProvider initialZone={timeZone}>{children}</TimeZoneProvider>
        <ClientErrorListener />
      </body>
    </html>
  );
}
