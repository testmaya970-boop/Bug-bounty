"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../lib/motion";

/**
 * VISUAL-IDENTITY SHOWCASE, taste-skill:soft-skill (Vanguard_UI_Architect) -- an isolated
 * demonstration of that skill's vocabulary, not a candidate direction for the real
 * product. The real product adopted the opposite visual language this same session
 * (industrial-brutalist: square corners, mono uppercase, one accent, CRT texture --
 * see app/globals.css and docs referenced there) -- this route exists purely so the
 * skill's own aesthetic can be seen and judged on its own terms, isolated at
 * /design-preview/vanguard-showcase exactly like security-record-prototype.tsx is
 * isolated at /design-preview/state-record. Never linked from nav, never wired into
 * app/page.tsx or app/layout.tsx's shared token/font system.
 *
 * Rolled from the skill's own Variance Engine: Vibe = Ethereal Glass (deep OLED black,
 * radial mesh glow, vantablack glass cards), Layout = Asymmetrical Bento. Content is
 * fictional showcase copy about a "Vanguard Security" product -- deliberately not real
 * Unpatched product content, so this reads as a design-language demo, not a competing
 * homepage draft.
 *
 * Fonts are self-scoped to this component (Google Fonts <link>, not next/font in the
 * shared root layout) -- a one-off prototype must not add a new font weight to every
 * real page's load. Reduced-motion respected throughout via usePrefersReducedMotion,
 * matching this codebase's own motion convention (lib/motion.ts).
 */

const FONT_LINK_HREF = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500&display=swap";
// Applied via inline style, not a Tailwind arbitrary `font-[family-name:...]` class --
// this component injects its own <link> at runtime rather than using next/font's CSS
// variable (see useGoogleFonts' own comment), and a literal multi-word family name in an
// arbitrary Tailwind value is fragile to quote correctly; a plain style object is the
// simpler, more robust way to apply a self-loaded web font here.
const DISPLAY_SERIF: React.CSSProperties = { fontFamily: "'Fraunces', Georgia, serif" };
const SANS: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" };

/** Injects the Google Fonts stylesheet once. The URL's own `display=swap` means a visitor
 * briefly sees the system fallback before the web font finishes downloading -- correct,
 * ordinary web-font behavior, not something to hide behind a page-wide opacity gate
 * (that would trade a normal font swap for a real regression: a blank screen on a slow
 * connection). */
function useGoogleFonts(): void {
  useEffect(() => {
    if (document.getElementById("vanguard-showcase-fonts")) return;
    const link = document.createElement("link");
    link.id = "vanguard-showcase-fonts";
    link.rel = "stylesheet";
    link.href = FONT_LINK_HREF;
    document.head.appendChild(link);
    return () => {
      document.getElementById("vanguard-showcase-fonts")?.remove();
    };
  }, []);
}

const WRAPPER_CLASS = "vanguard-showcase-root";

/**
 * app/globals.css loads on every route via the root layout (there is no per-route opt-out
 * of a stylesheet import) and carries a deliberate, load-bearing global rule for the real
 * product's brutalist skin:
 *   `*, *::before, *::after { border-radius: 0 !important; box-shadow: none !important;
 *    backdrop-filter: none !important; text-shadow: none !important; }`
 * That rule is correct for the real app (it exists precisely so no component can drift
 * back toward rounded corners/shadows) but it also flattens this showcase's entire
 * Double-Bezel/glass vocabulary, and no inline style or component-scoped class can beat
 * a global `!important` rule on specificity alone -- confirmed live: every rounded and
 * backdrop-blur utility class in this file rendered as hard square corners with no blur
 * despite being present and correct in the markup.
 *
 * The fix targets each of this file's own class combinations directly with an equally
 * specific, equally `!important` counter-rule scoped under WRAPPER_CLASS (so it can never
 * leak onto any other page), using each element's own literal rounded/backdrop-blur
 * pixel value -- not a guess at Tailwind v4's internal custom-property names (which this
 * codebase's Tailwind version does not document as stable API), so this stays correct
 * regardless of how Tailwind's own generated CSS happens to be implemented internally.
 */
function useCounterBrutalistOverride(): void {
  useEffect(() => {
    if (document.getElementById("vanguard-showcase-override")) return;
    const style = document.createElement("style");
    style.id = "vanguard-showcase-override";
    const scope = `.${WRAPPER_CLASS}`;
    style.textContent = `
      ${scope} .rounded-full { border-radius: 9999px !important; }
      ${scope} .rounded-\\[2rem\\] { border-radius: 2rem !important; }
      ${scope} .rounded-\\[calc\\(2rem-0\\.5rem\\)\\] { border-radius: calc(2rem - 0.5rem) !important; }
      ${scope} .backdrop-blur-2xl { backdrop-filter: blur(40px) !important; -webkit-backdrop-filter: blur(40px) !important; }
      ${scope} .backdrop-blur-3xl { backdrop-filter: blur(64px) !important; -webkit-backdrop-filter: blur(64px) !important; }
      ${scope} .shadow-\\[inset_0_1px_1px_rgba\\(255\\,255\\,255\\,0\\.08\\)\\] { box-shadow: inset 0 1px 1px rgba(255,255,255,0.08) !important; }
      ${scope} .shadow-\\[inset_0_1px_1px_rgba\\(255\\,255\\,255\\,0\\.06\\)\\] { box-shadow: inset 0 1px 1px rgba(255,255,255,0.06) !important; }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById("vanguard-showcase-override")?.remove();
    };
  }, []);
}

/** Fade-up-and-unblur on viewport entry, IntersectionObserver-driven (never a scroll
 * listener, per the skill's own performance guardrail) -- rendered fully visible
 * immediately under reduced motion, never a stripped-down animation. */
function useRevealOnView<T extends HTMLElement>(reducedMotion: boolean) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reducedMotion]);
  return { ref, visible };
}

function Reveal({ children, className, delayMs = 0, reducedMotion }: { children: React.ReactNode; className?: string; delayMs?: number; reducedMotion: boolean }) {
  const { ref, visible } = useRevealOnView<HTMLDivElement>(reducedMotion);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
      className={`transition-[transform,opacity,filter] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        visible ? "translate-y-0 opacity-100 blur-0" : "translate-y-16 opacity-0 blur-md"
      } ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/** The skill's "Fluid Island" nav: a floating glass pill, detached from the top edge,
 * with a hamburger that morphs into an X and a staggered full-screen glass overlay. */
function FluidIslandNav() {
  const [open, setOpen] = useState(false);
  const links = ["Platform", "Coverage", "Intelligence", "Pricing"];

  return (
    <>
      <nav className="fixed inset-x-0 top-6 z-50 mx-auto w-max">
        <div className="flex items-center gap-6 rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] backdrop-blur-2xl">
          <span style={SANS} className="text-sm font-semibold tracking-tight text-white">
            Vanguard
          </span>
          <div className="hidden items-center gap-5 sm:flex">
            {links.map((label) => (
              <a key={label} href="#" className="text-xs font-medium text-white/60 transition-colors duration-300 hover:text-white">
                {label}
              </a>
            ))}
          </div>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10"
          >
            <span
              className={`absolute h-px w-4 bg-white transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                open ? "translate-y-0 rotate-45" : "-translate-y-1"
              }`}
            />
            <span
              className={`absolute h-px w-4 bg-white transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                open ? "translate-y-0 -rotate-45" : "translate-y-1"
              }`}
            />
          </button>
        </div>
      </nav>

      <div
        className={`fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-black/85 backdrop-blur-3xl transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {links.map((label, i) => (
          <span
            key={label}
            style={{ ...DISPLAY_SERIF, transitionDelay: open ? `${100 + i * 80}ms` : "0ms" }}
            className={`text-4xl text-white transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              open ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </>
  );
}

/** Double-Bezel: an outer shell (soft tint, hairline ring, large radius) wrapping an
 * inner core (its own background, inset highlight, mathematically nested smaller
 * radius) -- never a container placed flat on the page background. */
function DoubleBezel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[2rem] bg-white/[0.03] p-2 ring-1 ring-white/10 ${className ?? ""}`}>
      <div className="h-full rounded-[calc(2rem-0.5rem)] bg-[#0a0a0d] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">{children}</div>
    </div>
  );
}

/** Button-in-button: the trailing arrow lives in its own circular wrapper, flush with
 * the pill's padding, with magnetic hover physics on both the pill and the icon. */
function MagneticCta({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="group inline-flex items-center gap-3 rounded-full bg-white py-1.5 pl-6 pr-1.5 text-sm font-semibold text-black transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
    >
      {children}
      <span className="flex size-8 items-center justify-center rounded-full bg-black/5 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-px group-hover:translate-x-1 group-hover:scale-105">
        <svg viewBox="0 0 16 16" fill="none" className="size-3.5" aria-hidden="true">
          <path d="M4 12L12 4M12 4H5M12 4V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}

function EyebrowTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/50">
      {children}
    </span>
  );
}

const BENTO_ITEMS = [
  {
    span: "sm:col-span-8 sm:row-span-2",
    eyebrow: "Live coverage",
    title: "Every asset, one continuously verified surface",
    body: "Vanguard re-derives your attack surface hourly, not at renewal time -- a domain that quietly went live at 2am is in scope before your team's coffee is.",
  },
  { span: "sm:col-span-4", eyebrow: "Response", title: "11 minute median triage", body: "From report to a human decision, measured across every engagement, every month." },
  { span: "sm:col-span-4", eyebrow: "Network", title: "2,400+ vetted researchers", body: "Invitation-gated by default, expandable to public discovery when you're ready." },
  {
    span: "sm:col-span-8",
    eyebrow: "Payouts",
    title: "Bounties clear in hours, not net-30",
    body: "A resolved, confirmed finding triggers payout the same day -- the incentive a fast researcher actually responds to.",
  },
];

export function VanguardShowcase() {
  useGoogleFonts();
  useCounterBrutalistOverride();
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className={`${WRAPPER_CLASS} min-h-[100dvh] bg-[#050505] text-white`} style={SANS}>
      {/* Fixed ambient mesh glow -- pointer-events-none, never on a scrolling container,
          per the skill's own texture-overlay performance guardrail. */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-40 size-[36rem] rounded-full bg-emerald-500/[0.08] blur-[120px]" />
        <div className="absolute -bottom-52 -right-32 size-[40rem] rounded-full bg-violet-500/[0.09] blur-[130px]" />
      </div>

      <FluidIslandNav />

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-40 pt-40 sm:px-6">
        {/* Hero */}
        <section className="min-h-[70dvh]">
          <Reveal reducedMotion={reducedMotion} className="flex flex-col items-start gap-6">
            <EyebrowTag>Continuous offensive security</EyebrowTag>
            {/* Not a real <h1>: this route still loads the shared app/globals.css, whose
                brutalist `h1, h2 { font-family: var(--font-display) !important; ... }`
                rule (a deliberate, load-bearing !important for the real product) would
                otherwise override this showcase's own serif regardless of inline style --
                confirmed live via getComputedStyle. role="heading" preserves the
                accessible semantics without hitting that element selector. */}
            <p role="heading" aria-level={1} style={DISPLAY_SERIF} className="max-w-3xl text-5xl leading-[1.05] tracking-tight sm:text-7xl">
              Find what a scanner <em className="text-white/60">can&rsquo;t</em>.
            </p>
            <p className="max-w-lg text-base leading-relaxed text-white/55">
              Vanguard pairs continuous asset discovery with a vetted researcher network and same-day payouts -- built for teams who&rsquo;d rather know today.
            </p>
            <div className="mt-2 flex items-center gap-4">
              <MagneticCta>Start a program</MagneticCta>
              <a href="#" className="text-sm font-medium text-white/50 underline decoration-white/20 underline-offset-4 transition-colors duration-300 hover:text-white">
                See a sample report
              </a>
            </div>
          </Reveal>
        </section>

        {/* Asymmetrical bento -- Double-Bezel throughout */}
        <section className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-12">
          {BENTO_ITEMS.map((item, i) => (
            <Reveal key={item.title} reducedMotion={reducedMotion} delayMs={i * 90} className={item.span}>
              <DoubleBezel className="h-full">
                <div className="flex h-full flex-col justify-between gap-8 p-8">
                  <EyebrowTag>{item.eyebrow}</EyebrowTag>
                  <div>
                    <h3 style={DISPLAY_SERIF} className="text-2xl leading-tight text-white">
                      {item.title}
                    </h3>
                    <p className="mt-3 max-w-md text-sm leading-relaxed text-white/50">{item.body}</p>
                  </div>
                </div>
              </DoubleBezel>
            </Reveal>
          ))}
        </section>

        {/* Closing CTA slab */}
        <Reveal reducedMotion={reducedMotion} className="mt-16">
          <DoubleBezel>
            <div className="flex flex-col items-start gap-6 p-10 sm:flex-row sm:items-center sm:justify-between sm:p-14">
              <div>
                <EyebrowTag>Get started</EyebrowTag>
                <p role="heading" aria-level={2} style={DISPLAY_SERIF} className="mt-4 text-3xl leading-tight text-white sm:text-4xl">
                  Ready when your scope is.
                </p>
              </div>
              <MagneticCta>Talk to the team</MagneticCta>
            </div>
          </DoubleBezel>
        </Reveal>
      </main>
    </div>
  );
}
