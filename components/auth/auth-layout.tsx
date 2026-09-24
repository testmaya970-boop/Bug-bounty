import React from "react";
import { cn } from "../../lib/cn";
import { SectionLabel } from "../ui/security-primitives";
import { WorkflowDiagram, type WorkflowStage } from "../marketing/workflow-diagram";

export type AuthVariant = "researcher" | "organization" | "default";

// Context-specific identity copy (see docs/decisions/0035): the researcher and
// organization signup pages each get a tagline and mini-sequence tailored to that side of
// the product, so the split itself communicates the decision rather than asking "what is
// your role?" a second time. Deliberately static -- no autoplay, no usePrefersReducedMotion
// -- the brief is explicit that the auth experience must stay calm; only the homepage's
// hero and lifecycle sections earn real motion.
//
// `accent` reuses the app's own two-hue brand identity (--action red / --accent-2 teal,
// app/globals.css) rather than inventing a third color: researcher keeps the default
// --action red (the same hue "Sign in"/every primary CTA already uses, since researchers
// are this product's majority audience), organization gets --accent-2 teal -- the one
// deliberate visual signal that these are two different entry points, not one template
// with the headline swapped (confirmed live: with copy alone, the two signup screens were
// indistinguishable from a glance). Sign-in stays neutral/red (`default`) since it isn't
// tied to either identity.
const IDENTITY: Record<AuthVariant, { tagline: string; stages: WorkflowStage[]; accent: "action" | "accent-2" }> = {
  researcher: {
    tagline: "Find vulnerabilities. Submit evidence. Track decisions.",
    accent: "action",
    stages: [
      { label: "Find", detail: "Test only what's explicitly in scope. Nothing unlisted is implicitly allowed." },
      { label: "Submit evidence", detail: "Text, code, request/response logs, or a file, attached to the report itself." },
      { label: "Track decisions", detail: "Triaging, needs information, accepted, resolved: every change is real and visible." },
    ],
  },
  organization: {
    tagline: "Define scope. Run programs. Triage findings. Record decisions.",
    accent: "accent-2",
    stages: [
      { label: "Define scope", detail: "The single most-specific match decides what's authorized." },
      { label: "Triage findings", detail: "A real state machine, never a generic status field." },
      { label: "Record decisions", detail: "Attributed and timestamped. Nothing quietly overwritten." },
    ],
  },
  default: {
    tagline: "Security work, recorded.",
    accent: "action",
    stages: [
      { label: "Report submitted", detail: "The target, scope match, and description, frozen at the moment of submission." },
      { label: "Evidence attached", detail: "Immutable once uploaded. A correction is a new entry, never an edit." },
      { label: "Decision recorded", detail: "A final decision, with a reason, readable by the organization." },
    ],
  },
};

/**
 * Two-column composition (see docs/decisions/0035): a dark identity panel carrying the
 * product's visual language into the auth experience, and the actual form -- unchanged in
 * behavior and markup, just no longer alone on a blank page. Previously this was a single
 * centered column on flat canvas with zero product context, the single worst-scoring
 * surface in the 0035 audit.
 *
 * On mobile the identity panel collapses to a short top band (wordmark + tagline only,
 * the mini-sequence hidden) -- an intentional mobile composition, not a shrunk copy of the
 * desktop split.
 *
 * docs/decisions/0057 supersedes this file's earlier "auth must stay calm" note: the form
 * column now gets the same one-time `hero-reveal` first-paint treatment the rest of the
 * app's bold direction uses, motion-safe gated like everywhere else.
 */
export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  variant = "default",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  variant?: AuthVariant;
}) {
  const identity = IDENTITY[variant];
  const isAccent2 = identity.accent === "accent-2";
  return (
    <div className="min-h-dvh bg-canvas text-ink lg:flex">
      {/* Same low ambient green/orange glow as every other dark bg-ink panel in the app
          (docs/decisions/0062) -- a flat solid identity band was the single largest area
          of unbroken color on the entire auth flow and read as an unfinished block rather
          than a deliberate dark panel. Deliberately static (no drift/motion), matching
          this component's own "auth stays calm" note above. The ambient corner glow was
          removed under the Tactical Telemetry reskin (gradients are prohibited); the
          researcher/organization entry points are still distinguished by the signal dot's
          color below and by their copy. */}
      <div className="relative overflow-hidden bg-ink px-4 py-8 text-canvas sm:px-6 lg:flex lg:w-[26rem] lg:shrink-0 lg:flex-col lg:justify-between lg:py-12">
        <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-0 text-canvas" />
        <div className="relative flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Unpatched</span>
          <span className="hidden border-l border-canvas/25 pl-3 text-[11px] font-semibold uppercase tracking-wider text-canvas/50 sm:inline">Security operations</span>
        </div>
        <p className="relative mt-6 flex max-w-sm items-center gap-2 text-lg font-semibold tracking-tight lg:mt-0">
          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full motion-safe:animate-[signal-pulse-once_900ms_ease-out_1]", isAccent2 ? "bg-canvas" : "bg-action")} />
          {identity.tagline}
        </p>
        <div className="relative mt-8 hidden lg:block">
          <WorkflowDiagram stages={identity.stages} tone="inverted" />
        </div>
      </div>

      <main className="flex w-full flex-1 flex-col px-4 py-16 sm:px-6 sm:py-20 lg:items-center lg:justify-center">
        <div className="w-full max-w-sm motion-safe:animate-hero-reveal">
          <SectionLabel>{eyebrow}</SectionLabel>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 text-sm text-ink-muted">{description}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
