"use client";

import { useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import { usePrefersReducedMotion } from "../../lib/motion";

gsap.registerPlugin(ScrollTrigger, SplitText);

// The app's own established "strong ease-out" curve (app/globals.css's --animate-hero-reveal),
// reused here rather than inventing a second one GSAP-side.
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * Owns the public homepage's two additive motion layers: a Lenis smooth-scroll instance
 * (tied to GSAP's own ticker so ScrollTrigger and Lenis agree on scroll position) and a
 * composed GSAP intro/scroll-reveal sequence. Renders no DOM of its own -- PublicHome's
 * markup (app/page.tsx) is the real content, already complete and readable server-rendered
 * with no JS at all; this component only reaches into it via data attributes and layers
 * motion on top. That split (server-rendered content, client-only motion controller) is
 * why this file exists separately rather than making the whole homepage a client component.
 *
 * Reduced motion is not "shorter" here -- it is a structurally different path: Lenis is
 * never constructed, ScrollTrigger's scroller proxy is never installed (native scroll
 * stays exactly as the browser already renders it), and the hero/chapter elements are
 * left in their server-rendered, fully visible final state with zero GSAP tweens applied.
 * Every element this controls must therefore already be visible without JavaScript --
 * confirmed by design: this component only ever ADDS an entrance/reveal on top of markup
 * that renders complete on its own.
 */
export function PublicHomeMotion() {
  const reducedMotion = usePrefersReducedMotion();

  useLayoutEffect(() => {
    if (reducedMotion) return;

    const lenis = new Lenis({ autoRaf: false });
    const raf = (time: number) => lenis.raf(time * 1000);
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      // --- Hero intro: headline word-by-word, then copy, then CTAs. ---
      const heroHeading = document.querySelector<HTMLElement>("[data-motion='hero-heading']");
      const heroCopy = document.querySelector<HTMLElement>("[data-motion='hero-copy']");
      const heroCtas = document.querySelector<HTMLElement>("[data-motion='hero-ctas']");

      if (heroHeading) {
        // SplitText replaces the heading's own text nodes with word-wrapped spans for the
        // animation only -- the wrapping element keeps the original, unsplit text as its
        // aria-label so assistive tech reads one clean sentence, never per-word fragments,
        // and the split spans themselves are marked aria-hidden.
        const originalText = heroHeading.textContent ?? "";
        heroHeading.setAttribute("aria-label", originalText);
        const split = new SplitText(heroHeading, { type: "words", aria: "hidden" });
        gsap.set(split.words, { yPercent: 100, opacity: 0 });

        const heroTimeline = gsap.timeline({ delay: 0.1 });
        heroTimeline
          .to(split.words, { yPercent: 0, opacity: 1, duration: 0.7, ease: EASE_OUT, stagger: 0.045 })
          .fromTo(heroCopy, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: EASE_OUT }, "-=0.35")
          .fromTo(heroCtas, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: EASE_OUT }, "-=0.3");
      }

      // --- Each chapter: heading word-reveal, then its own body copy and figure follow
      // in the same timeline -- one section-by-section choreography, not independently
      // triggered elements that could settle out of the reading order they're meant to
      // establish (heading names the chapter, body explains it, figure is the "second
      // read" moment, in that order every time). Scoped to each heading's own containing
      // section so multiple chapters never cross-trigger each other's timelines.
      const chapterHeadings = document.querySelectorAll<HTMLElement>("[data-motion='chapter-heading']");
      chapterHeadings.forEach((heading) => {
        const originalText = heading.textContent ?? "";
        heading.setAttribute("aria-label", originalText);
        const split = new SplitText(heading, { type: "words", aria: "hidden" });
        gsap.set(split.words, { yPercent: 100, opacity: 0 });

        const section = heading.closest("section");
        const body = section?.querySelectorAll<HTMLElement>("[data-motion='chapter-body']") ?? [];
        const figure = section?.querySelector<HTMLElement>("[data-motion='chapter-figure']");

        const timeline = gsap.timeline({ scrollTrigger: { trigger: heading, start: "top 85%", once: true } });
        timeline.to(split.words, { yPercent: 0, opacity: 1, duration: 0.6, ease: EASE_OUT, stagger: 0.03 });
        if (body.length > 0) {
          timeline.fromTo(body, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: EASE_OUT, stagger: 0.08 }, "-=0.3");
        }
        if (figure) {
          timeline.fromTo(figure, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: EASE_OUT }, "-=0.35");
        }
      });
    });

    return () => {
      ctx.revert();
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, [reducedMotion]);

  return null;
}
