import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "../components/theme-provider";

// The redesign's own type system: Space Grotesk for display/heading weight, Inter for UI
// and body text (see docs/decisions/0060-security-ops-typography-system.md). Both loaded as CSS
// variables here, once, at the root -- consumed via globals.css's own --font-display/
// --font-sans tokens (@theme inline), never re-imported per component.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
// JetBrains Mono: every existing `font-mono` call site (targets, report/org ids, CVSS
// scores, bounty figures) previously fell through to Tailwind's default mono stack, which
// resolves to whatever system monospace font the visitor's OS happens to have -- never a
// deliberate choice. This is a font-loading addition only: it fills the existing
// --font-mono slot in globals.css's @theme block, so every current `font-mono` class
// picks it up automatically with no call-site changes anywhere.
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains-mono", display: "swap" });

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

// Runs synchronously, before the browser paints anything, so the correct theme class is
// already on <html> the instant styles apply -- without this, the page renders with
// neither `dark` nor `light` present (ThemeProvider's own theme resolution only runs
// inside a useEffect, which fires after the first paint), producing a real, visible
// flash from the browser's own default rendering to the actual theme on every load/
// refresh. Kept in exact lockstep with ThemeProvider's own resolution logic (the same
// `sentinel-theme` key, the same dark/light decision) -- one is never allowed to drift
// from the other. suppressHydrationWarning on <html> is still correct/necessary: React's
// server-rendered markup never has this class (it can't know the client's localStorage
// or OS preference), and this script deliberately changes the DOM before React hydrates.
//
// Dark is now the PRIMARY default (supersedes docs/decisions/0062's light-primary
// reskin): the fallback when there is no saved preference is dark, regardless of the
// OS's prefers-color-scheme -- a first-time visitor in any browser lands on dark. The
// explicit toggle still works and is still honored first (a saved "light"/"dark" always
// wins). This must stay the exact inverse of ThemeProvider's own resolution (below) or
// the two will disagree on first paint.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("sentinel-theme");var d=t==="light"?false:true;var c=document.documentElement.classList;c.toggle("dark",d);c.toggle("light",!d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
