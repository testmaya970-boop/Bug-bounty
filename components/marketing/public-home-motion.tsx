"use client";

import { useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import { MOTION, usePrefersReducedMotion } from "../../lib/motion";
import { EVIDENCE_NODES, orbitPoint } from "./evidence-field";
import { SIGNAL_POINTS } from "./hero-art/bug-specimen";

gsap.registerPlugin(ScrollTrigger, SplitText);

const EASE_OUT = MOTION.ease.out;

/**
 * Owns the public homepage's motion: a Lenis smooth-scroll instance (tied to GSAP's own
 * ticker so ScrollTrigger and Lenis agree on scroll position) and one GSAP context holding
 * every scroll and ambient sequence. Renders no DOM of its own -- PublicHome's markup
 * (app/page.tsx) is the real content, already complete and readable server-rendered with
 * no JS at all; this component only reaches into it via data attributes and layers motion
 * on top. The state-machine chapter owns its own scrubbed timeline (state-machine-diagram.tsx)
 * because it also drives React state; everything else lives here.
 *
 * Each chapter moves differently, on purpose:
 *   hero      ambient: a red marker travels the evidence orbit, pausing to inspect each node;
 *             pointer depth on fine pointers; the field and copy part on scroll-out
 *   chapter 1 scrubbed: the specimen draws on arrival, then a signal visits each callout
 *   chapter 2 pinned scrub (state-machine-diagram.tsx)
 *   chapter 3 paired reveals: step N of both paths lands together; numbers light as read
 *   chapter 4 the peak: the seal settles into place under the scroll and keeps turning
 *
 * Reduced motion is not "shorter" here -- it is a structurally different path: Lenis is
 * never constructed, `html[data-home-motion]` is never set (so every CSS loop in
 * globals.css stays off), and no tween is created. Every element this touches is already
 * visible and finished without JavaScript.
 */
export function PublicHomeMotion() {
  const reducedMotion = usePrefersReducedMotion();

  useLayoutEffect(() => {
    if (reducedMotion) return;

    const html = document.documentElement;
    html.dataset.homeMotion = "";

    const lenis = new Lenis({ autoRaf: false });
    const raf = (time: number) => lenis.raf(time * 1000);
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const mm = gsap.matchMedia();
    const ctx = gsap.context(() => {
      heroIntro();
      chapterHeadings();
      heroField(mm);
      chapterArt();
      bugSignal();
      workflows(mm);
      seal();
      reveals();
      atmosphere();
    });

    // The state-machine pin is created by a child effect after this one, and it adds scroll
    // length above every later section: re-measure once everything exists, and again once
    // web fonts settle line heights.
    const refresh = () => {
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
    };
    const frame = requestAnimationFrame(refresh);
    document.fonts?.ready.then(refresh).catch(() => {});

    return () => {
      cancelAnimationFrame(frame);
      ctx.revert();
      resetAtmosphere();
      mm.revert();
      gsap.ticker.remove(raf);
      lenis.destroy();
      delete html.dataset.homeMotion;
    };
  }, [reducedMotion]);

  return null;
}

function q<T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) {
  return scope.querySelector<T>(selector);
}

// Split a heading into word masks for the animation only. The element keeps its unsplit
// text as aria-label so assistive tech reads one sentence, never per-word fragments.
function splitWords(heading: HTMLElement) {
  heading.setAttribute("aria-label", heading.textContent ?? "");
  const split = new SplitText(heading, { type: "words", aria: "hidden" });
  gsap.set(split.words, { yPercent: 100, opacity: 0 });
  return split.words;
}

/** Hero: headline word by word, then copy, then CTAs. Interactive immediately. */
function heroIntro() {
  const heading = q("[data-motion='hero-heading']");
  if (!heading) return;
  const words = splitWords(heading);
  gsap
    .timeline({ delay: 0.1 })
    .to(words, { yPercent: 0, opacity: 1, duration: 0.7, ease: EASE_OUT, stagger: MOTION.stagger.words })
    .fromTo("[data-motion='hero-copy']", { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: MOTION.duration.reveal, ease: EASE_OUT }, "-=0.35")
    .fromTo("[data-motion='hero-ctas']", { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: EASE_OUT }, "-=0.3");
}

/**
 * Each chapter: heading word-reveal, then its own body copy and figure, in reading order
 * (heading names the chapter, body explains it, figure is the second read). Scoped to each
 * heading's own section so chapters never cross-trigger each other.
 */
function chapterHeadings() {
  document.querySelectorAll<HTMLElement>("[data-motion='chapter-heading']").forEach((heading) => {
    const words = splitWords(heading);
    const section = heading.closest("section");
    const body = section?.querySelectorAll<HTMLElement>("[data-motion='chapter-body']") ?? [];
    const figure = section?.querySelector<HTMLElement>("[data-motion='chapter-figure']");

    const timeline = gsap.timeline({ scrollTrigger: { trigger: heading, start: "top 85%", once: true } });
    timeline.to(words, { yPercent: 0, opacity: 1, duration: MOTION.duration.reveal, ease: EASE_OUT, stagger: 0.03 });
    if (body.length > 0) {
      timeline.fromTo(body, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: EASE_OUT, stagger: 0.08 }, "-=0.3");
    }
    if (figure) {
      timeline.fromTo(figure, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: MOTION.duration.reveal, ease: EASE_OUT }, "-=0.35");
    }
  });
}

/**
 * The evidence field: the red marker travels the orbit and holds at each node while that
 * node's inspection ring and label light (the `.is-active` styles in globals.css). Runs
 * only while the hero is on screen. Fine pointers get a three-plane depth response; on
 * scroll-out the field drifts slower than the page and the copy lifts away.
 */
function heroField(mm: gsap.MatchMedia) {
  const hero = q("[data-motion='hero']");
  const field = q("[data-motion='evidence-field']");
  if (!hero || !field) return;

  const nodes = Array.from(field.querySelectorAll<SVGGElement>("[data-motion='evidence-node']"));
  const marker = Array.from(field.querySelectorAll<SVGCircleElement>("[data-motion='evidence-marker'] circle"));
  const halo = marker[0];
  const position = { theta: EVIDENCE_NODES[0].theta };
  const place = () => {
    const { x, y } = orbitPoint(position.theta);
    marker.forEach((circle) => {
      circle.setAttribute("cx", String(x));
      circle.setAttribute("cy", String(y));
    });
  };

  const travel = gsap.timeline({ repeat: -1, paused: true });
  EVIDENCE_NODES.forEach((node, index) => {
    const next = EVIDENCE_NODES[index + 1]?.theta ?? EVIDENCE_NODES[0].theta + 360;
    travel
      .call(() => nodes[index]?.classList.add("is-active"))
      .to(halo, { attr: { r: 18 }, opacity: 0, duration: MOTION.ambient.hold, ease: "power1.out" })
      .set(halo, { attr: { r: 11 }, opacity: 1 })
      .call(() => nodes[index]?.classList.remove("is-active"))
      .fromTo(position, { theta: node.theta }, { theta: next, duration: (next - node.theta) * MOTION.ambient.secondsPerDegree, ease: MOTION.ease.inOut, onUpdate: place });
  });

  ScrollTrigger.create({
    trigger: hero,
    start: "top bottom",
    end: "bottom top",
    toggleClass: "is-inview",
    onToggle: (self) => (self.isActive ? travel.play() : travel.pause()),
  });

  const leaving = { trigger: hero, start: "top top", end: "bottom top", scrub: true } as const;
  gsap.to(field, { yPercent: 16, ease: "none", scrollTrigger: leaving });
  gsap.to("[data-motion='hero-content']", { y: -56, opacity: 0.2, ease: "none", scrollTrigger: leaving });

  mm.add("(hover: hover) and (pointer: fine) and (min-width: 1024px)", () => {
    const layers = Array.from(field.querySelectorAll<SVGGElement>("[data-depth]")).map((layer) => ({
      depth: Number(layer.dataset.depth),
      x: gsap.quickTo(layer, "x", { duration: 1.4, ease: "power3.out" }),
      y: gsap.quickTo(layer, "y", { duration: 1.4, ease: "power3.out" }),
    }));
    const onMove = (event: PointerEvent) => {
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      layers.forEach((layer) => {
        layer.x(nx * layer.depth * 16);
        layer.y(ny * layer.depth * 10);
      });
    };
    hero.addEventListener("pointermove", onMove);
    return () => hero.removeEventListener("pointermove", onMove);
  });
}

/** Chapter illustrations draw (and the seal turns) only while they are on screen. */
function chapterArt() {
  document.querySelectorAll<HTMLElement>(".chapter-art-full").forEach((figure) => {
    ScrollTrigger.create({ trigger: figure, start: "top 80%", end: "bottom top", toggleClass: "is-inview" });
  });
}

/** Chapter one: a signal visits each callout in reading order, lighting its leader line. */
function bugSignal() {
  const signal = q<SVGGElement>("[data-motion='bug-signal']");
  const figure = signal?.closest("figure");
  if (!signal || !figure) return;
  const leaders = signal.querySelectorAll<SVGPathElement>(".bug-signal-ldr");
  const dots = Array.from(signal.querySelectorAll<SVGCircleElement>(":scope > circle"));

  const timeline = gsap.timeline({ scrollTrigger: { trigger: figure, start: "top 60%", end: "bottom 50%", scrub: MOTION.scrub } });
  timeline.to(signal, { opacity: 1, duration: 0.3 });
  SIGNAL_POINTS.forEach(([cx, cy], index) => {
    if (index > 0) timeline.to(dots, { attr: { cx, cy }, duration: 1, ease: "power1.inOut" });
    if (leaders[index]) timeline.to(leaders[index], { strokeDashoffset: 0, duration: 0.6, ease: "none" });
  });
}

/**
 * Chapter three: step N of the researcher path and step N of the organization path land
 * together (left a beat before right on wide screens), label before detail; each step's
 * number turns red while it sits above the reading line.
 */
function workflows(mm: gsap.MatchMedia) {
  const cells = Array.from(document.querySelectorAll<HTMLElement>("[data-wf-row]"));
  if (cells.length === 0) return;
  mm.add({ wide: "(min-width: 1024px)" }, (context) => {
    const wide = Boolean(context.conditions?.wide);
    cells.forEach((cell) => {
      const right = cell.style.getPropertyValue("--wf-col").trim() === "2";
      const parts = cell.querySelectorAll<HTMLElement>("[data-motion='wf-label'], [data-motion='wf-detail']");
      gsap.fromTo(parts, { y: 12, opacity: 0 }, {
        y: 0,
        opacity: 1,
        duration: 0.5,
        ease: EASE_OUT,
        stagger: 0.06,
        delay: wide && right ? 0.1 : 0,
        scrollTrigger: { trigger: wide ? (cells.find((c) => c.dataset.wfRow === cell.dataset.wfRow) ?? cell) : cell, start: "top 88%", once: true },
      });
      const index = cell.querySelector<HTMLElement>("[data-motion='wf-index']");
      if (index) {
        ScrollTrigger.create({
          trigger: cell,
          start: "top 62%",
          end: "bottom top",
          onToggle: (self) => {
            index.style.color = self.isActive ? "var(--action)" : "";
          },
        });
      }
    });
  });
}

/**
 * Chapter four, the page's peak: the seal settles into place under the scroll (scaling up
 * as its ring text rotates home), then keeps turning on its own while on screen (the CSS
 * loops in globals.css). Beside it, each recorded fact gets its red rule as it arrives.
 */
function seal() {
  const figure = q(".seal-orbit");
  const svg = figure ? q<SVGSVGElement>("svg", figure) : null;
  const ringText = figure ? q<SVGGElement>("[data-motion='seal-ring-text']", figure) : null;
  if (figure && svg) {
    const timeline = gsap.timeline({ scrollTrigger: { trigger: figure, start: "top 90%", end: "center 45%", scrub: MOTION.scrub } });
    timeline.fromTo(svg, { scale: 0.86, rotation: -8 }, { scale: 1, rotation: 0, ease: "none", transformOrigin: "50% 50%" }, 0);
    if (ringText) timeline.fromTo(ringText, { rotation: -28, svgOrigin: "400 400" }, { rotation: 0, svgOrigin: "400 400", ease: "none" }, 0);
  }

  document.querySelectorAll<HTMLElement>("[data-motion='record-tick']").forEach((tick) => {
    gsap.fromTo(tick, { scaleY: 0 }, { scaleY: 1, duration: 0.5, ease: EASE_OUT, scrollTrigger: { trigger: tick.parentElement, start: "top 82%", once: true } });
  });
}

/**
 * The background environment (atmosphere.tsx), every section. Scroll drives it; the CSS loops
 * only add slow life while a section is on screen.
 *   page-wide   the raking light bands slide and turn with the whole page's scroll, so the
 *               light moves continuously across section boundaries
 *   per section bands drift at their own depth; the evidence thread draws to the reader's
 *               position; and each section's own figure follows that section's progress
 */
function atmosphere() {
  const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-atmo]"));
  if (roots.length === 0) return;

  const shadows = roots.map((root) => q("[data-atmo-layer='shadow']", root)).filter((el): el is HTMLElement => el !== null);
  gsap.fromTo(shadows, { xPercent: -7, rotation: -4 }, { xPercent: 7, rotation: 4, ease: "none", scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 1.2 } });

  roots.forEach((root) => {
    const section = root.parentElement;
    if (!section) return;
    const variant = root.dataset.atmo;
    const across = { trigger: section, start: "top bottom", end: "bottom top", scrub: MOTION.scrub } as const;

    ScrollTrigger.create({ trigger: section, start: "top bottom", end: "bottom top", toggleClass: { targets: root, className: "is-live" } });
    const shadow = q("[data-atmo-layer='shadow']", root);
    if (shadow) gsap.fromTo(shadow, { yPercent: -6 }, { yPercent: 6, ease: "none", scrollTrigger: across });

    thread(root, section, variant === "close");

    if (variant === "evidence") {
      gsap.fromTo(q("[data-atmo-layer='ruler']", root), { yPercent: 4 }, { yPercent: -10, ease: "none", scrollTrigger: across });
    }

    if (variant === "lifecycle") {
      const progress = q("[data-atmo-part='progress']", root);
      const light = q("[data-atmo-part='light']", root);
      const stages = Array.from(root.querySelectorAll<HTMLElement>("[data-atmo-part='stage']"));
      gsap
        .timeline({
          scrollTrigger: {
            trigger: section,
            start: "top 60%",
            end: "bottom 40%",
            scrub: MOTION.scrub,
            onUpdate: (self) => stages.forEach((stage, index) => (stage.style.background = self.progress >= index / (stages.length - 1) - 0.001 ? "var(--action)" : "")),
          },
        })
        .fromTo(progress, { scaleY: 0 }, { scaleY: 1, ease: "none" }, 0)
        .fromTo(light, { y: () => section.offsetHeight * 0.1 }, { y: () => section.offsetHeight * 0.9, ease: "none" }, 0);
    }

    if (variant === "workflows") {
      // Two depths: the guide moves faster than the page, the crossing path slower.
      gsap.fromTo(q("[data-atmo-layer='guide-right']", root), { yPercent: 6 }, { yPercent: -12, ease: "none", scrollTrigger: across });
      gsap.fromTo(q("[data-atmo-layer='cross']", root), { yPercent: -4 }, { yPercent: 4, ease: "none", scrollTrigger: across });
      const cross = q<SVGPathElement>("[data-atmo-layer='cross'] path", root);
      if (cross) {
        gsap.set(cross, { strokeDasharray: "1 1" });
        gsap.fromTo(cross, { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: section, start: "top 70%", end: "bottom 60%", scrub: MOTION.scrub } });
      }
    }

    if (variant === "record") {
      const rings = Array.from(root.querySelectorAll<SVGSVGElement>("[data-atmo-layer='ring']"));
      const turns: Record<string, number> = { a: 50, b: -38, c: 22 };
      rings.forEach((ring) => gsap.fromTo(ring, { rotation: 0 }, { rotation: turns[ring.dataset.ring ?? "a"] ?? 0, ease: "none", scrollTrigger: across }));
      gsap.fromTo(q(".atmo-rings", root), { scale: 0.9 }, { scale: 1.06, ease: "none", scrollTrigger: across });
      // The light gathers on the seal while it is centred, and eases off as it leaves.
      gsap
        .timeline({ scrollTrigger: across })
        .fromTo(q("[data-atmo-part='glow']", root), { opacity: 0.15 }, { opacity: 1, ease: "sine.inOut" })
        .to(q("[data-atmo-part='glow']", root), { opacity: 0.3, ease: "sine.inOut" });
    }

    if (variant === "rest") {
      gsap.fromTo(shadow, { opacity: 0.6 }, { opacity: 0.2, ease: "none", scrollTrigger: { trigger: section, start: "top bottom", end: "bottom bottom", scrub: MOTION.scrub } });
    }
  });
}

/**
 * One section's thread segment. Progress runs "top center" to "bottom center", so progress
 * IS the reader's position down the section (0..1000 in the path's own box). The red ink is
 * drawn to the point on the path at that height and the signal sits on it; a segment that
 * does not start at the section top (the hero's) stays undrawn until the reader reaches it.
 * At the close, the signal hands off to the resting node (its red centre fills) on arrival.
 */
function thread(root: HTMLElement, section: HTMLElement, rests: boolean) {
  const box = q("[data-atmo-layer='thread']", root);
  const ink = box ? q<SVGPathElement>("[data-atmo-part='thread-ink']", box) : null;
  const signal = box ? q("[data-atmo-part='signal']", box) : null;
  const rest = rests && box ? q("[data-atmo-part='rest']", box) : null;
  if (!box || !ink || !signal) return;
  const total = ink.getTotalLength();
  const startY = ink.getPointAtLength(0).y;
  const endY = ink.getPointAtLength(total).y;
  ink.style.strokeDasharray = "1 1";
  ink.style.strokeDashoffset = "1";
  signal.style.opacity = "0";

  // Paths only ever descend, so the length at a given height is a binary search.
  const lengthAtY = (y: number) => {
    let lo = 0;
    let hi = total;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (ink.getPointAtLength(mid).y < y) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const render = (progress: number, active: boolean) => {
    const y = progress * 1000;
    const length = y <= startY ? 0 : y >= endY ? total : lengthAtY(y);
    ink.style.strokeDashoffset = String(1 - length / total);
    const point = ink.getPointAtLength(length);
    signal.style.transform = `translate(${(point.x / 80) * box.offsetWidth}px, ${(point.y / 1000) * box.offsetHeight}px)`;
    // At the close, the signal hands off to the resting node once it arrives.
    const arrived = rests && y >= endY;
    rest?.toggleAttribute("data-rested", arrived);
    signal.style.opacity = active && y > startY && y < endY ? "1" : "0";
  };
  ScrollTrigger.create({
    trigger: section,
    start: "top center",
    // The page runs out of scroll before the reading line can cross the last section, so the
    // close's segment finishes exactly at the bottom of the page instead.
    end: rests ? "max" : "bottom center",
    onUpdate: (self) => render(self.progress, self.isActive),
    onToggle: (self) => render(self.progress, self.isActive),
    onRefresh: (self) => render(self.progress, self.isActive),
  });
}

// The thread and rail write a few inline styles per frame (outside GSAP tweens, so
// ctx.revert() cannot undo them): clear exactly those, back to the static CSS state.
function resetAtmosphere() {
  document.querySelectorAll<HTMLElement>("[data-atmo-part='stage']").forEach((el) => el.style.removeProperty("background"));
  document.querySelectorAll<HTMLElement>("[data-atmo-part='signal']").forEach((el) => {
    el.style.removeProperty("opacity");
    el.style.removeProperty("transform");
  });
  document.querySelectorAll("[data-atmo-part='rest']").forEach((el) => el.removeAttribute("data-rested"));
  document.querySelectorAll<SVGPathElement>("[data-atmo-part='thread-ink']").forEach((el) => {
    el.style.removeProperty("stroke-dasharray");
    el.style.removeProperty("stroke-dashoffset");
  });
}

/** The close and the footer: a short, single settle into place. */
function reveals() {
  document.querySelectorAll<HTMLElement>("[data-motion='reveal']").forEach((element) => {
    gsap.fromTo(element, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: MOTION.duration.reveal, ease: EASE_OUT, scrollTrigger: { trigger: element, start: "top 90%", once: true } });
  });
}
