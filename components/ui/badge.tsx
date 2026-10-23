import React from "react";
import { cn } from "../../lib/cn";
import { organizationRoleLabel } from "../../services/authorization";
import { programStatusLabel } from "../../lib/program-status";
import { assetTypeLabel, scopeStateLabel } from "../../lib/scope-labels";
import type { OrganizationMemberStatus, OrganizationRole } from "../../types/auth";
import type { OrganizationStatus } from "../../types/organization";
import type { ProgramStatus, ProgramType } from "../../types/program";
import type { ProgramAssetType, ScopeState } from "../../types/scope";
import type { ProgramResearcherStatus } from "../../types/researcher";
import type { ReportSeverity, ReportStatus } from "../../types/report";
import type { KycStatus } from "../../types/researcher-identity";
import type { PaymentObligationStatus } from "../../types/payment";
import type { CtfCategoryId, CtfDifficulty } from "../../lib/mock/ctf";

/** Flat, dot-plus-label operational indicator -- deliberately not a pill/chip (no border,
 * no background fill): "status should look like operational information," not a decorative
 * badge. The dot is enrichment only, never the sole signal -- the text label is always
 * present and is what every existing test asserts on.
 *
 * `pulse` (docs/decisions/0057) is a bounded, finite `glow-pulse` accent for a status that
 * JUST changed (e.g. a report that moved to "needs_information" a moment ago) -- it
 * decorates the dot, it never replaces the text label, and it runs a fixed 2 iterations
 * (never `infinite`) so it can never read as an ongoing/live indicator. `motion-safe:`
 * gated; under reduced motion the dot renders with no animation at all. */
export function Badge({ className, children, dotClassName, pulse }: { className?: string; children: React.ReactNode; dotClassName?: string; pulse?: boolean }) {
  return (
    // Oct 22: a label pill (GitHub/Linear-style) -- sentence case, a hairline, the tone on the
    // dot and text. Never color alone: the label text always says the state.
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium", className)}>
      {dotClassName && <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", dotClassName, pulse && "motion-safe:animate-glow-pulse")} />}
      {children}
    </span>
  );
}

/**
 * Every semantic tone below is a `{ text, bg }` pair, both written as literal class
 * strings in the SAME object -- not `bg-*` derived at runtime from `text-*` via
 * `.replace()`. That derivation was this file's original design (one hand-maintained
 * value, no drift) but is a real, silent rendering bug under Tailwind's static content
 * scanner: Tailwind only generates CSS for class names it can find as literal text
 * somewhere in the scanned source, and a string built by `.replace("text-","bg-")` at
 * runtime is invisible to that scan. `bg-warning` and every `bg-severity-*` class were
 * never emitted anywhere in this codebase's compiled CSS as a result -- every warning-
 * toned and every severity-toned status DOT has been rendering invisible (no color, no
 * error) for the life of this component. Found while building a real chart that reused
 * the same pattern (see docs/decisions/0045). Still exactly one edit site per tone (no
 * drift risk reintroduced) -- just no longer computed. */
export type Tone = { text: string; bg: string };

const TONE = {
  info: { text: "text-info", bg: "bg-info" },
  warning: { text: "text-warning", bg: "bg-warning" },
  success: { text: "text-success", bg: "bg-success" },
  danger: { text: "text-danger", bg: "bg-danger" },
  muted: { text: "text-ink-muted", bg: "bg-ink-muted" },
  severityCritical: { text: "text-severity-critical", bg: "bg-severity-critical" },
  severityHigh: { text: "text-severity-high", bg: "bg-severity-high" },
  severityMedium: { text: "text-severity-medium", bg: "bg-severity-medium" },
  severityLow: { text: "text-severity-low", bg: "bg-severity-low" },
  severityNone: { text: "text-severity-none", bg: "bg-severity-none" },
  // The one existing non-severity accent token (--accent-2, already used for gamification/
  // reputation UI -- badge-grid.tsx, your-position-panel.tsx) -- reused here, not a new
  // color, specifically so a CTF practice-challenge concept never shares a tone with a
  // real report severity/status.
  accent2: { text: "text-accent-2", bg: "bg-accent-2" },
} as const satisfies Record<string, Tone>;

// Exported so a single-use page (app/organizations/page.tsx's organization status) can
// render dot+text from an existing tone without a new one-page-only badge wrapper.
export function ToneBadge({ tone, children, pulse }: { tone: Tone; children: React.ReactNode; pulse?: boolean }) {
  return (
    <Badge className={tone.text} dotClassName={tone.bg} pulse={pulse}>
      {children}
    </Badge>
  );
}

// Matches DOMAIN.md's report lifecycle exactly (types/report.ts's ReportStatus, the same
// enum supabase/migrations/202608270001_report_foundation.sql defines) -- not a demo
// taxonomy. duplicate/informative/not_applicable/rejected share a style deliberately:
// all are terminal, non-actionable outcomes from an operator's point of view,
// distinguished by their text label, never by color alone.
// Exported so real charts (components/charts/*) can color their segments from the exact
// same status->tone mapping this badge uses, rather than a second, driftable map.
export const statusTone: Record<ReportStatus, Tone> = {
  new: TONE.info,
  triaging: TONE.warning,
  needs_information: TONE.warning,
  accepted: TONE.success,
  resolved: TONE.success,
  duplicate: TONE.muted,
  informative: TONE.muted,
  not_applicable: TONE.muted,
  rejected: TONE.danger,
};
export function StatusBadge({ status, pulse }: { status: ReportStatus; pulse?: boolean }) {
  return (
    <ToneBadge tone={statusTone[status]} pulse={pulse}>
      {status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}
    </ToneBadge>
  );
}

// Organization-confirmed severity only (types/report.ts's ReportSeverity) -- see
// docs/decisions/0009-report-triage-state-machine.md for why researcher-proposed
// severity remains deferred.
// Exported so real charts (components/charts/*) can color their segments from the exact
// same severity->tone mapping this badge uses, rather than a second, driftable map.
export const severityTone: Record<ReportSeverity, Tone> = {
  critical: TONE.severityCritical,
  high: TONE.severityHigh,
  medium: TONE.severityMedium,
  low: TONE.severityLow,
  none: TONE.severityNone,
};
export function SeverityBadge({ severity }: { severity: ReportSeverity }) {
  return <ToneBadge tone={severityTone[severity]}>{severity[0].toUpperCase() + severity.slice(1)}</ToneBadge>;
}

export function RoleBadge({ role }: { role: OrganizationRole }) { return <Badge>{organizationRoleLabel(role)}</Badge>; }

// "created" never actually occurs in practice (see docs/decisions -- organizations are
// provisioned straight to "active"); it maps to the same quiet muted tone as a safe
// default rather than inventing a meaning for a state no code path produces.
export const organizationStatusTone: Record<OrganizationStatus, Tone> = { created: TONE.muted, active: TONE.success, suspended: TONE.danger };

const memberStatusTone: Record<OrganizationMemberStatus, Tone> = { active: TONE.success, suspended: TONE.warning, removed: TONE.muted };
export function MemberStatusBadge({ status }: { status: OrganizationMemberStatus }) {
  return <ToneBadge tone={memberStatusTone[status]}>{status[0].toUpperCase() + status.slice(1)}</ToneBadge>;
}

export function PendingInvitationBadge() {
  return <ToneBadge tone={TONE.info}>Pending</ToneBadge>;
}

// not_submitted/pending/verified/rejected -- see docs/decisions/0051. There is no
// "verifying..." state: this is a manual, out-of-band review, not a live provider call.
const kycStatusTone: Record<KycStatus, Tone> = { not_submitted: TONE.muted, pending: TONE.warning, verified: TONE.success, rejected: TONE.danger };
const kycStatusLabels: Record<KycStatus, string> = { not_submitted: "Not submitted", pending: "Pending review", verified: "Verified", rejected: "Rejected" };
export function KycStatusBadge({ status }: { status: KycStatus }) {
  return <ToneBadge tone={kycStatusTone[status]}>{kycStatusLabels[status]}</ToneBadge>;
}

// draft/paused share a style deliberately: both are "not currently visible/active" states
// from an operator's point of view, distinguished by their text label, never by color alone.
const programStatusTone: Record<ProgramStatus, Tone> = { draft: TONE.muted, review: TONE.warning, active: TONE.success, paused: TONE.muted, closed: TONE.muted, suspended: TONE.danger };
export function ProgramStatusBadge({ status }: { status: ProgramStatus }) {
  return <ToneBadge tone={programStatusTone[status]}>{programStatusLabel(status)}</ToneBadge>;
}

// vdp is a real, permanent fact about the program (it can never pay a bounty, enforced at
// the database level, not just a UI label) -- info-toned, since it's neither good nor bad
// news on its own, just a thing a researcher needs to know before deciding to participate.
export function ProgramTypeBadge({ programType }: { programType: ProgramType }) {
  if (programType !== "vdp") return null;
  return <ToneBadge tone={TONE.info}>Disclosure only</ToneBadge>;
}

// Scope state is the authorization decision itself -- always paired with explicit text,
// never color alone (SECURITY.md/DESIGN.md).
const scopeStateTone: Record<ScopeState, Tone> = { in_scope: TONE.success, out_of_scope: TONE.danger };
export function ScopeStateBadge({ state }: { state: ScopeState }) {
  return <ToneBadge tone={scopeStateTone[state]}>{scopeStateLabel(state)}</ToneBadge>;
}

export function AssetTypeBadge({ assetType }: { assetType: ProgramAssetType }) { return <Badge className="text-ink-muted">{assetTypeLabel(assetType)}</Badge>; }

const researcherStatusTone: Record<ProgramResearcherStatus, Tone> = { active: TONE.success, suspended: TONE.warning, revoked: TONE.muted };
export function ResearcherStatusBadge({ status }: { status: ProgramResearcherStatus }) {
  return <ToneBadge tone={researcherStatusTone[status]}>{status[0].toUpperCase() + status.slice(1)}</ToneBadge>;
}

// pending/processing share the in-progress tone deliberately (both are "not yet resolved,"
// distinguished by their text label); failed is a resting, non-terminal state (a retry may
// follow) but still reads as danger-toned since it needs attention; cancelled is a neutral
// terminal outcome, matching duplicate/informative's own muted styling for reports -- see
// types/payment.ts's own comment on this exact status shape (docs/decisions/0014).
const paymentObligationStatusTone: Record<PaymentObligationStatus, Tone> = { pending: TONE.warning, processing: TONE.warning, succeeded: TONE.success, failed: TONE.danger, cancelled: TONE.muted };
const paymentObligationStatusLabels: Record<PaymentObligationStatus, string> = { pending: "Pending", processing: "Processing", succeeded: "Paid", failed: "Failed", cancelled: "Cancelled" };
export function PaymentObligationStatusBadge({ status, pulse }: { status: PaymentObligationStatus; pulse?: boolean }) {
  return (
    <ToneBadge tone={paymentObligationStatusTone[status]} pulse={pulse}>
      {paymentObligationStatusLabels[status]}
    </ToneBadge>
  );
}

// The first two badges in this file sourced from lib/mock/ctf.ts's own enums rather than a
// real types/*.ts domain type -- there is no real CTF backend/table yet, so these enums
// live alongside their mock data instead of a domain type that would imply one exists.
//
// Difficulty deliberately does NOT reuse success/warning/severity-high/severity-critical --
// those are a real report's own severity/status vocabulary, and a CTF practice challenge
// (Easy/Medium/Hard/Insane) is an unrelated concept. Reusing that exact color progression
// here meant "Insane" rendered in the identical red as a real "critical" security finding
// elsewhere on the same dashboard, teaching a false equivalence between practice-challenge
// difficulty and real severity. Only two real colors exist outside that vocabulary at this
// product's own restrained, no-new-decoration bar (muted gray, the accent-2 secondary
// accent already used for gamification UI); Hard and Insane share the same tone
// (text-ink, the strongest non-severity color available) and are distinguished by weight
// -- Insane bold+underlined -- the same "never color alone" discipline this file's own
// pulse/dot conventions already follow, rather than inventing a new color for one label.
const difficultyTone: Record<CtfDifficulty, Tone> = { Easy: TONE.muted, Medium: TONE.accent2, Hard: { text: "text-ink", bg: "bg-ink" }, Insane: { text: "text-ink", bg: "bg-ink" } };
export function DifficultyBadge({ difficulty }: { difficulty: CtfDifficulty }) {
  return (
    <Badge className={difficulty === "Insane" ? `${difficultyTone[difficulty].text} font-bold underline` : difficultyTone[difficulty].text} dotClassName={difficultyTone[difficulty].bg}>
      {difficulty}
    </Badge>
  );
}

const ctfCategoryTone: Record<CtfCategoryId, Tone> = {
  web: TONE.info,
  crypto: TONE.muted,
  "reverse-engineering": TONE.warning,
  "binary-pwn": TONE.danger,
  forensics: TONE.severityMedium,
  network: TONE.severityLow,
};
export function CtfCategoryBadge({ categoryId, label }: { categoryId: CtfCategoryId; label: string }) {
  return <ToneBadge tone={ctfCategoryTone[categoryId]}>{label}</ToneBadge>;
}
