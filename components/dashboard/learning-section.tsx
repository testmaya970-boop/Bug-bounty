import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Flag } from "@phosphor-icons/react/dist/ssr";
import { SectionLabel } from "../ui/security-primitives";
import type { MockChallengeCategory } from "../../lib/mock/researcher-dashboard";

/** category.id is a real CtfCategoryId (see lib/mock/ctf.ts's deriveDashboardCategories),
 * so every card here links straight into /ctf, pre-filtered -- this widget is now a real
 * entry point into the CTF section, not a dead-end teaser.
 *
 * The featured-track tile previously was a flat `bg-ink` rectangle with nothing but text
 * pinned to one corner -- on the old dark-primary theme that read as "a dark hero card";
 * on this theme's dark ink token it just reads as an empty black box (found live: exactly
 * that "still generic / black box" feedback). It now carries real visual interest of its
 * own -- a layered green/orange gradient mesh plus a large, mostly-transparent watermark
 * icon -- so it earns being the visually dominant tile instead of relying on "dark plus
 * text" to look intentional. */
export function LearningSection({ categories }: { categories: MockChallengeCategory[] }) {
  return (
    <div>
      <SectionLabel>Learning</SectionLabel>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Season of challenges</h2>
        <Link prefetch={false} href={"/ctf" as Route} className="text-sm font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Explore all challenges →
        </Link>
      </div>
      <p className="mt-1 max-w-xl text-sm text-ink-muted">Practice real-world exploitation techniques and rack up points before you take them into a live program.</p>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Link prefetch={false}
          href={"/ctf" as Route}
          className="group relative flex min-h-40 flex-col justify-end overflow-hidden rounded-lg bg-ink p-6 text-canvas motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-0 text-canvas" />
          <Flag
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 -top-6 size-40 text-canvas/10 transition-transform duration-300 motion-reduce:transition-none group-hover:scale-110 group-hover:rotate-6"
          />
          <div className="relative">
            {/* text-action-on-dark, not text-action: see app/globals.css's own token
                comment -- --action fails contrast on this dark panel. */}
            <p className="font-mono text-[11px] font-semibold text-action-on-dark">Featured track</p>
            <p className="mt-1 text-xl font-semibold">Web fundamentals: cookies, injection, and access control</p>
          </div>
        </Link>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
          {categories.map((category) => (
            <Link prefetch={false}
              key={category.id}
              href={`/ctf?category=${category.id}` as Route}
              className="rounded-lg bg-surface-muted p-3.5 transition-colors duration-150 hover:bg-surface-hover motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <p className="text-sm font-medium text-ink">{category.label}</p>
              <p className="mt-0.5 font-mono text-xs text-ink-muted">{category.challengeCount} challenges</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
