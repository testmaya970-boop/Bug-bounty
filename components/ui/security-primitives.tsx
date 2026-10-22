import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { cn } from "../../lib/cn";

/** A small uppercase technical label -- SUBMISSION / EVIDENCE / COMMUNICATION / TRIAGE /
 * DECISION HISTORY. Every section eyebrow in the report workspace, scope registry, and
 * directory used to be a hand-written `<p className="text-xs font-semibold uppercase
 * tracking-wide text-ink-muted">` -- one real, identical string duplicated across a dozen
 * files. This is that string, named once. Netras eyebrow: a short red dash before the
 * label. The text itself stays ink-muted (7.0:1 even on surface-muted) rather than
 * Netras's red, which is only 4.18:1 on the muted ground at this 12px size. */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[13px] font-medium text-ink-muted", className)}>{children}</p>;
}

/** A fact rendered as LABEL above VALUE, not "Label: value" inline -- the shape DESIGN.md's
 * metadata blocks use throughout the report rail and submission summary. `mono` renders
 * the value in the monospace stack this codebase reserves for identifiers/targets. */
export function MetadataPair({ label, value, mono, className }: { label: string; value: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={cn("mt-0.5 text-sm font-medium text-ink", mono && "break-all font-mono")}>{value}</p>
    </div>
  );
}

/** The shared shell for a dense, aligned list of security records -- scope entries,
 * program participations, evidence, communication. A bordered container with divided rows
 * inside it, never a stack of individually-bordered cards: one distinct object (the list),
 * not N distinct-looking boxes for what is actually one registry. */
export function RegistryList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("divide-y divide-border rounded-lg border border-border bg-surface", className)}>{children}</ul>;
}

/**
 * The one high-weight primary action block in the authenticated product (see
 * docs/decisions/0043, restyled under 0062's unified warm-theme reskin) -- a single,
 * deliberately large call to action, never a small text link doing the job of a page's
 * most important button. Used exactly where a page has one real next step it wants the
 * user to take without hunting for it: the researcher home launchpad, a program's "can I
 * research this" panel. The dark ink surface plus a low, ambient green glow (not the
 * brand action fill `Button` uses) is what gives it more visual weight than an ordinary
 * primary button -- reserved for this one recurring pattern, not a general-purpose card.
 */
export function PrimaryActionPanel({ eyebrow, title, description, href, actionLabel }: { eyebrow: string; title: string; description?: string; href: Route; actionLabel: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-ink px-6 py-8 text-canvas shadow-[0_24px_48px_-20px_rgba(0,0,0,0.55)] sm:px-8 sm:py-9">
      <div className="relative">
        {/* text-action-on-dark, not text-action: this panel always renders on bg-ink;
            see app/globals.css's own token comment for why --action fails contrast here. */}
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-action-on-dark">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        {description && <p className="mt-2 max-w-lg text-sm text-canvas/70">{description}</p>}
        <Link prefetch={false}
          href={href}
          className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-md bg-canvas px-6 text-sm font-semibold text-ink transition-[transform,background-color] duration-200 ease-out hover:bg-canvas/90 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-canvas"
        >
          {actionLabel} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
