import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { MetadataPair, SectionLabel } from "../components/ui/security-primitives";
import { ScopeStateBadge, SeverityBadge, StatusBadge, ProgramStatusBadge } from "../components/ui/badge";
import { LiveWorkflowArtifact } from "../components/marketing/live-workflow-artifact";
import { LifecycleStepper, type LifecycleStage } from "../components/marketing/lifecycle-stepper";
import { WorkflowDiagram } from "../components/marketing/workflow-diagram";
import { ProgramDiscoveryPreview } from "../components/marketing/program-discovery-preview";
import { RealProductFragment } from "../components/marketing/real-product-fragment";
import { getCurrentUser } from "../lib/auth/current-user";
import { listMyPendingProgramInvitations, listMyProgramParticipations } from "../services/program-researchers";
import { listMyReports } from "../services/reports";
import { hasAnyOrganizationMembership } from "../services/organizations";
import { getMyReputationLedger, getMyReputationProgramCounts, getPublicLeaderboard, getResearcherReputationScore } from "../services/reputation";
import { getMyHomeDashboardSummary } from "../services/home-dashboard";
import { listMyPaymentObligations } from "../services/payments";
import { computeResearcherDashboardStatus } from "../lib/dashboard-status";
import { MAX_PAGE_SIZE } from "../lib/pagination";
import { ReputationLedgerSection } from "../components/reputation/reputation-ledger";
import { ReputationProgramContext } from "../components/reputation/reputation-programs";
import { ReputationCharts } from "../components/reputation/reputation-charts";
import { CommandRow } from "../components/dashboard/command-row";
import { OperationalGrid } from "../components/dashboard/operational-grid";
import { StandingSplit } from "../components/dashboard/standing-split";
import { ReferenceStrip } from "../components/dashboard/reference-strip";
import { LearningSection } from "../components/dashboard/learning-section";
import { MOCK_CHALLENGE_CATEGORIES, MOCK_CHALLENGE_SPOTLIGHT } from "../lib/mock/researcher-dashboard";
import { computeReportActivityWeeks } from "../lib/activity-calendar";
import { listTopBountyPrograms } from "../services/programs";
import { perfTimed } from "../lib/perf-trace";

// Public-homepage layout reskin (docs/decisions/0056), now the whole app's palette
// (docs/decisions/0062): PublicHome's warm cream/green/orange colors are no longer a
// component-scoped override -- they ARE app/globals.css's `:root` theme, so every
// existing shared primitive (Badge, SectionLabel, MetadataPair, LiveWorkflowArtifact,
// RealProductFragment, AppShell, and every authenticated screen) reads the identical
// tokens with zero prop changes. Only this page's typeface stays a deliberate, disclosed
// exception (Plus Jakarta Sans, per 0056) to the app-wide Space Grotesk/Inter pairing.
const displayFont = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700", "800"], display: "swap" });

const headingClass = `${displayFont.className} font-extrabold tracking-tight text-ink`;

const primaryLinkClass =
  "inline-flex min-h-12 items-center gap-2 rounded-full bg-accent-2 px-7 text-sm font-bold text-on-accent-2 shadow-[0_8px_20px_-8px_var(--glow-accent-2)] transition duration-200 hover:bg-accent-2 hover:brightness-90 hover:shadow-[0_10px_28px_-8px_var(--glow-accent-2)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const secondaryLinkClass =
  "inline-flex min-h-12 items-center gap-2 rounded-full border border-border-strong bg-surface px-7 text-sm font-bold text-ink transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const invertedPrimaryLinkClass = primaryLinkClass;
const invertedSecondaryLinkClass =
  "inline-flex min-h-12 items-center gap-2 rounded-full border border-canvas/30 px-7 text-sm font-bold text-canvas transition hover:bg-canvas/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** A small pill eyebrow -- Jasper's own recurring "topic chip" above a section heading --
 * rebuilt with Sentinel's tokens (surface/border/ink-muted), never Jasper's literal
 * colors. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3.5 py-1 text-xs font-bold uppercase tracking-wide text-action">
      {children}
    </span>
  );
}

/** One tinted, rounded feature card -- Jasper's bento-grid feature block, rebuilt from
 * Sentinel's own semantic tone tokens (info/success/warning) rather than Jasper's literal
 * pastel hex values, so light/content stays honest to what each block is about. */
function FeatureCard({ tone, title, description, children }: { tone: "action" | "info" | "warning"; title: string; description: string; children?: React.ReactNode }) {
  const toneBg = tone === "action" ? "bg-action/10" : tone === "info" ? "bg-info/10" : "bg-warning/10";
  const toneBorder = tone === "action" ? "border-action/25" : tone === "info" ? "border-info/25" : "border-warning/25";
  return (
    <div className={`rounded-3xl border ${toneBorder} ${toneBg} p-7`}>
      {children && <div className="mb-5">{children}</div>}
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</p>
    </div>
  );
}

/** A single stat tile -- Jasper's "10,000+ / Compliant / 60%" proof band, rebuilt from
 * Sentinel's own domain facts (the workflow this page already describes), never invented
 * customer metrics. */
function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <p className={`${headingClass} text-3xl sm:text-4xl`}>{value}</p>
      <p className="mt-1 text-sm text-ink-muted">{label}</p>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group rounded-2xl border border-border bg-surface p-5 open:bg-surface-muted">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-ink [&::-webkit-details-marker]:hidden">
        {question}
        <span aria-hidden="true" className="shrink-0 text-xl text-ink-muted transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">{answer}</p>
    </details>
  );
}

const RESEARCHER_STAGES = [
  { label: "Join a program", detail: "An organization invites you directly by email. There is no public application queue yet." },
  { label: "Understand scope", detail: "Every in-scope and out-of-scope target is explicit before you test anything. Nothing unlisted is implicitly allowed." },
  { label: "Submit a finding", detail: "Target, title, description: the server makes the final scope decision, not the form." },
  { label: "Attach evidence", detail: "Text, code, request/response logs, or a file, up to 10 MB. Attached at submission or added afterward." },
  { label: "Communicate", detail: "A structured message thread on the report itself, not a scattered email chain." },
  { label: "Track resolution", detail: "Every status change is real and visible: triaging, needs information, accepted, resolved." },
  { label: "Build reputation", detail: "An append-only record of organization-confirmed outcomes. Never a score, never a leaderboard." },
];

const ORGANIZATION_STAGES = [
  { label: "Define a program", detail: "Created at draft. Nothing is exposed to a researcher until you're ready." },
  { label: "Define scope", detail: "Domains, URLs, or IP ranges. The single most-specific match decides what's authorized." },
  { label: "Invite researchers", detail: "By email, one at a time. An invited researcher gains no access to any other program or your organization." },
  { label: "Triage a report", detail: "A real state machine: new, triaging, needs information, accepted. Never a generic status field." },
  { label: "Request information", detail: "Ask the researcher directly on the report, without changing its outcome." },
  { label: "Make a decision", detail: "Resolved, duplicate, informative, not applicable, or rejected. A bounty decision is layered on top, never inside the report row." },
  { label: "Audit", detail: "Every decision is attributed and timestamped. Nothing is quietly overwritten." },
];

/** A small bordered artifact card -- the same visual grammar LiveWorkflowArtifact uses,
 * at a lighter weight, so a LifecycleStepper's per-stage panel reads as a real Sentinel
 * record rather than a generic illustration. */
function StagePanel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border-strong bg-surface p-6">{children}</div>;
}

const SECURITY_LIFECYCLE_STAGES: LifecycleStage[] = [
  {
    key: "program",
    label: "Program",
    artifact: (
      <StagePanel>
        <MetadataPair label="Program" value="CloudVault" />
        <div className="mt-3">
          <ProgramStatusBadge status="active" />
        </div>
      </StagePanel>
    ),
  },
  {
    key: "scope",
    label: "Scope",
    artifact: (
      <StagePanel>
        <MetadataPair label="Scope" value="*.cloudvault.example" mono />
        <div className="mt-3">
          <ScopeStateBadge state="in_scope" />
        </div>
      </StagePanel>
    ),
  },
  {
    key: "report",
    label: "Report",
    artifact: (
      <StagePanel>
        <SectionLabel>Report</SectionLabel>
        <p className="mt-1.5 text-base font-semibold text-ink">Authentication bypass on session refresh</p>
        <div className="mt-3">
          <SeverityBadge severity="critical" />
        </div>
      </StagePanel>
    ),
  },
  {
    key: "triage",
    label: "Triage",
    artifact: (
      <StagePanel>
        <SectionLabel>Triage</SectionLabel>
        <p className="mt-1.5 text-sm text-ink-muted">The organization asks the researcher for a reproduction step.</p>
        <div className="mt-3">
          <StatusBadge status="needs_information" />
        </div>
      </StagePanel>
    ),
  },
  {
    key: "decision",
    label: "Decision",
    artifact: (
      <StagePanel>
        <SectionLabel>Decision</SectionLabel>
        <p className="mt-1.5 text-sm text-ink-muted">Confirmed, with a bounty decided separately from the report itself.</p>
        <div className="mt-3">
          <StatusBadge status="accepted" />
        </div>
      </StagePanel>
    ),
  },
  {
    key: "audit",
    label: "Audit",
    artifact: (
      <StagePanel>
        <SectionLabel>Audit</SectionLabel>
        <p className="mt-1.5 text-sm text-ink-muted">Who decided what, and when. Readable by the organization, not just implied.</p>
        <div className="mt-3">
          <StatusBadge status="resolved" />
        </div>
      </StagePanel>
    ),
  },
];

const RESEARCHER_LIFECYCLE_STAGES: LifecycleStage[] = [
  {
    key: "target",
    label: "Target found",
    artifact: (
      <StagePanel>
        <MetadataPair label="Scope" value="*.cloudvault.example" mono />
      </StagePanel>
    ),
  },
  {
    key: "finding",
    label: "Finding submitted",
    artifact: (
      <StagePanel>
        <p className="text-sm font-semibold text-ink">Authentication bypass</p>
        <div className="mt-2">
          <SeverityBadge severity="critical" />
        </div>
      </StagePanel>
    ),
  },
  {
    key: "evidence",
    label: "Evidence attached",
    artifact: (
      <StagePanel>
        <MetadataPair label="Evidence" value="3 artifacts" />
      </StagePanel>
    ),
  },
  {
    key: "submitted",
    label: "Report submitted",
    artifact: (
      <StagePanel>
        <StatusBadge status="new" />
      </StagePanel>
    ),
  },
];

const ORGANIZATION_LIFECYCLE_STAGES: LifecycleStage[] = [
  {
    key: "arrives",
    label: "Report arrives",
    artifact: (
      <StagePanel>
        <p className="text-sm font-semibold text-ink">Authentication bypass</p>
        <div className="mt-2">
          <StatusBadge status="new" />
        </div>
      </StagePanel>
    ),
  },
  {
    key: "severity",
    label: "Severity assessed",
    artifact: (
      <StagePanel>
        <SeverityBadge severity="critical" />
      </StagePanel>
    ),
  },
  {
    key: "requested",
    label: "Information requested",
    artifact: (
      <StagePanel>
        <StatusBadge status="needs_information" />
      </StagePanel>
    ),
  },
  {
    key: "decided",
    label: "Decision recorded",
    artifact: (
      <StagePanel>
        <StatusBadge status="accepted" />
      </StagePanel>
    ),
  },
];

const SIGNAL_PATH = ["Program", "Scope", "Finding", "Evidence", "Triage", "Researcher response", "Decision", "Audit record"];

const PHILOSOPHY_STAGES = [
  { label: "Report submitted", detail: "The target, the scope match, and the description: frozen at the moment of submission." },
  { label: "Evidence attached", detail: "Text, code, or a file. Immutable once uploaded. A corrected finding is a new entry, never an edit." },
  { label: "Triage decision", detail: "Every transition needs an actor and an event. There is no generic status field that could be set silently." },
  { label: "Researcher communication", detail: "Kept with the report it concerns, not lost in a separate inbox." },
  { label: "Resolution", detail: "A final decision, with a reason. Not a status flipped without explanation." },
  { label: "Audit trail", detail: "Who decided what, and when. Readable by the organization, not just implied by the current state." },
];

/**
 * The real public entry point. Previously an anonymous visit to "/" rendered the full
 * authenticated AppShell chrome around one line of text -- not a landing page, an empty
 * authenticated state wearing the wrong layout (see docs/decisions/0030). 0031-0036 then
 * built this into a dark/light "security instrument" page from Sentinel's own domain
 * vocabulary; 0056 reversed that into a warm, light, rounded "marketing SaaS" layout and
 * rhythm, originally scoped to this component alone. 0062 promoted that palette to
 * app/globals.css's actual `:root` theme, so this page now simply inherits the same
 * tokens every authenticated screen does -- no component-scoped override left to drift
 * out of sync. Every word of copy, every real component, and every real link are
 * unchanged from 0031-0036; only the shell, layout, typefaces, and (as of 0062) the
 * theme's scope have changed.
 */
function PublicHome() {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-10 bg-canvas/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full border border-border-strong bg-surface px-5 py-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-5 text-action" />
            <span className={`${displayFont.className} text-lg font-extrabold tracking-tight`}>Unpatched</span>
          </div>
          <nav aria-label="Page sections" className="hidden items-center gap-6 text-sm font-semibold text-ink-muted md:flex">
            <a href="#how-it-works" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
              How it works
            </a>
            <a href="#for-researchers" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
              For researchers
            </a>
            <a href="#for-organizations" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
              For organizations
            </a>
            <Link href="/programs" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
              Programs
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="hidden text-sm font-semibold text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus sm:inline">
              Sign in
            </Link>
            <Link href="/sign-up" className={`${primaryLinkClass} min-h-10 px-5 text-xs`}>
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* 01 HERO — Jasper's own hero shape: a centered eyebrow pill, a big two-line
            headline, a short subhead, two pill CTAs, then the product artifact sitting
            BELOW the copy as one wide staged panel rather than beside it. Content
            unchanged from 0031-0036's hero copy. */}
        <section className="px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
          <div className="mx-auto max-w-4xl text-center">
            <Eyebrow>Security operations, actually recorded</Eyebrow>
            <h1 className={`${headingClass} mt-6 text-4xl leading-[1.05] sm:text-5xl lg:text-6xl`}>
              Find what matters.
              <br />
              Prove it. Resolve it.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-ink-muted sm:text-lg">
              Unpatched turns security noise into a recorded signal: researchers submit real findings, organizations triage and decide, and every step, evidence, response, resolution, becomes part
              of an audit record no one quietly overwrites.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href={"/researchers/sign-up" as Route} className={primaryLinkClass}>
                Explore security research <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href={"/organizations/sign-up" as Route} className={secondaryLinkClass}>
                Run a security program
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-5xl rounded-[2rem] border border-border-strong bg-surface-muted p-4 shadow-[0_40px_90px_-40px_rgba(22,28,20,0.35)] sm:p-8">
            <div className="flex justify-center">
              <LiveWorkflowArtifact />
            </div>
          </div>
        </section>

        {/* 02 SIGNAL PATH STRIP — Jasper's "who trusts us" logo band, rebuilt honestly:
            Sentinel has no customer logos to show, so this strip carries the one true
            claim the logo band would otherwise stand in for -- the real accountable path
            every report moves through. */}
        <section className="border-y border-border bg-surface px-4 py-8 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <p className="text-center text-xs font-bold uppercase tracking-wider text-ink-muted">Every report moves through the same recorded path</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-3">
              {SIGNAL_PATH.map((label, index) => (
                <React.Fragment key={label}>
                  <span className="rounded-full border border-border-strong bg-canvas px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-ink">{label}</span>
                  {index < SIGNAL_PATH.length - 1 && (
                    <span aria-hidden="true" className="text-ink-muted">
                      →
                    </span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* 03 FEATURE BENTO — Jasper's tri-card "Agents / Content Pipelines / Jasper IQ"
            band, rebuilt as Sentinel's own three pillars, each still linking into the
            real, existing lifecycle stepper below it rather than losing that content. */}
        <section id="how-it-works" className="px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow>What Unpatched does</Eyebrow>
              <h2 className={`${headingClass} mt-4 text-3xl sm:text-4xl`}>Security noise, turned into a recorded signal.</h2>
              <p className="mt-4 text-base text-ink-muted">Every report Unpatched handles moves through the same accountable path, the same one shown running above.</p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              <FeatureCard tone="action" title="Program & scope" description="Domains, URLs, or IP ranges. The single most-specific match decides what's authorized, before anyone tests anything.">
                <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-action/15 text-action">
                  <ShieldCheck aria-hidden="true" className="size-5" />
                </span>
              </FeatureCard>
              <FeatureCard tone="info" title="Report & evidence" description="Target, title, description, evidence: text, code, logs, or a file. The server makes the final scope decision, not the form.">
                <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-info/15 text-info">
                  <CheckCircle2 aria-hidden="true" className="size-5" />
                </span>
              </FeatureCard>
              <FeatureCard tone="warning" title="Triage & audit" description="A real state machine: new, triaging, needs information, accepted. Every decision is attributed, timestamped, and never quietly overwritten.">
                <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-warning/15 text-warning">
                  <ArrowRight aria-hidden="true" className="size-5" />
                </span>
              </FeatureCard>
            </div>

            <div className="mt-14 rounded-3xl border border-border bg-surface p-6 sm:p-10">
              <h3 className={`${headingClass} text-2xl sm:text-3xl`}>One security lifecycle, not a feature list.</h3>
              <p className="mt-3 max-w-xl text-sm text-ink-muted sm:text-base">Program, scope, report, triage, decision, audit. Click a stage, or watch it advance on its own.</p>
              <div className="mt-8">
                <LifecycleStepper stages={SECURITY_LIFECYCLE_STAGES} />
              </div>
            </div>
          </div>
        </section>

        {/* 04 PROOF BAND — Jasper's "10,000+ / Compliant / 60%" stat tiles, rebuilt from
            Sentinel's own true, non-fabricated facts about how the workflow itself works
            (never invented customer/usage metrics — DESIGN.md and AGENTS.md both forbid
            that regardless of this page's visual reskin). */}
        <section className="bg-surface-muted px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile value="7 stages" label="Program → scope → finding → evidence → triage → response → decision → audit." />
              <StatTile value="1 record" label="Every evidence upload is immutable once attached. A correction is a new entry, never an edit." />
              <StatTile value="0 silent changes" label="Every status transition needs an actor and an event. There is no generic field that can be set quietly." />
            </div>
          </div>
        </section>

        {/* 05 TWO SIDES — Jasper's alternating benefit sections, rebuilt as Sentinel's
            existing researcher/organization split, content and both lifecycle steppers
            and both WorkflowDiagrams fully unchanged. */}
        <section className="px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
              <div id="for-researchers" className="rounded-3xl border border-action/25 bg-action/5 p-7 sm:p-9">
                <Eyebrow>For researchers</Eyebrow>
                <h2 className={`${headingClass} mt-4 text-2xl sm:text-3xl`}>Find real work. Keep the record.</h2>
                <div className="mt-6">
                  <LifecycleStepper stages={RESEARCHER_LIFECYCLE_STAGES} autoAdvanceMs={2200} compact />
                </div>
                <div className="mt-7 rounded-2xl border border-border bg-surface p-5">
                  <WorkflowDiagram stages={RESEARCHER_STAGES} />
                </div>
                <Link href={"/researchers/sign-up" as Route} className={`${primaryLinkClass} mt-7`}>
                  Continue as researcher <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
              <div id="for-organizations" className="rounded-3xl border border-info/25 bg-info/5 p-7 sm:p-9">
                <Eyebrow>For organizations</Eyebrow>
                <h2 className={`${headingClass} mt-4 text-2xl sm:text-3xl`}>Run a program, not a vulnerability inbox.</h2>
                <div className="mt-6">
                  <LifecycleStepper stages={ORGANIZATION_LIFECYCLE_STAGES} autoAdvanceMs={2200} compact />
                </div>
                <div className="mt-7 rounded-2xl border border-border bg-surface p-5">
                  <WorkflowDiagram stages={ORGANIZATION_STAGES} />
                </div>
                <Link href={"/organizations/sign-up" as Route} className={`${secondaryLinkClass} mt-7`}>
                  Run a security program
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 06 REAL PRODUCT — the same cropped report-inbox fragment as before, now
            staged in a light rounded panel instead of a dark chapter, matching the
            reference's own "product screenshot inside a soft card" pattern. */}
        <section className="bg-surface-muted px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <Eyebrow>The real product</Eyebrow>
            <h2 className={`${headingClass} mt-4 text-3xl sm:text-4xl`}>This is Unpatched, not a mockup of Unpatched.</h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-ink-muted">The same report inbox, the same badges, the same columns an organization sees inside the real product.</p>
            <div className="mt-10 flex justify-center">
              <RealProductFragment />
            </div>
          </div>
        </section>

        {/* 07 WHY THE RECORD MATTERS — the philosophy section, content unchanged. */}
        <section className="px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <Eyebrow>Why it&rsquo;s built this way</Eyebrow>
            <h2 className={`${headingClass} mt-4 text-3xl sm:text-4xl`}>Security work should leave a record.</h2>
            <p className="mt-4 max-w-xl text-base text-ink-muted">Not a status that quietly changed. Not a decision no one can trace back to a reason.</p>
            <div className="mt-9 rounded-3xl border border-border bg-surface p-6 sm:p-8">
              <WorkflowDiagram stages={PHILOSOPHY_STAGES} />
            </div>
          </div>
        </section>

        {/* 08 FAQ — Jasper's own closing "frequently asked questions" band. Real
            questions about Sentinel's real, current constraints (no public program
            marketplace yet, invite-only access) rather than invented filler — the same
            honest disclosure ProgramDiscoveryPreview always carried, now given the
            visual weight an FAQ answer deserves instead of one muted footnote line. */}
        <section className="px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <Eyebrow>Questions</Eyebrow>
            <h2 className={`${headingClass} mt-4 text-3xl sm:text-4xl`}>Frequently asked questions</h2>
            <div className="mt-8 space-y-3">
              <FaqItem
                question="Can I browse every program on Unpatched?"
                answer="Some organizations open their program to the whole community, and those are listed publicly. Most programs remain invitation-only for now. An organization invites a researcher directly by email rather than through an open application queue."
              />
              <FaqItem
                question="What happens to a report after I submit it?"
                answer="It enters a real triage state machine: new, triaging, needs information, accepted. Every transition is attributed to an actor and timestamped, and a final decision, resolved, duplicate, informative, not applicable, or rejected, always carries a reason."
              />
              <FaqItem
                question="Can evidence be edited after I attach it?"
                answer="No. Text, code, and files are immutable once uploaded. A corrected finding is a new entry, never a silent edit to the original."
              />
              <FaqItem question="Is Unpatched's audit trail visible to me?" answer="Yes. Every decision on a report you're part of, as the submitting researcher or an authorized organization member, is readable, not just implied by the current status." />
            </div>
            <div className="mt-6">
              <ProgramDiscoveryPreview />
            </div>
          </div>
        </section>

        {/* 09 FINAL CTA — Sentinel's dark closing band kept as the one deliberate dark
            moment on the page, matching the reference's own dark closing CTA section.
            Carries the same dot-grid texture + ambient glow every other dark bg-ink
            surface in the app now does (docs/decisions/0062). */}
        <section className="relative mx-4 overflow-hidden rounded-[2.5rem] bg-ink px-6 py-16 text-center text-canvas sm:mx-6 sm:py-20">
          <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-0 text-canvas" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--glow-action),transparent_55%),radial-gradient(ellipse_at_bottom_right,var(--glow-accent-2),transparent_50%)] opacity-70" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className={`${headingClass} text-canvas text-3xl sm:text-5xl`}>Every decision on Unpatched is recorded. Nothing is quietly overwritten.</h2>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link href={"/researchers/sign-up" as Route} className={invertedPrimaryLinkClass}>
                Continue as researcher <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href={"/organizations/sign-up" as Route} className={invertedSecondaryLinkClass}>
                Continue as organization
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-border pt-8 text-sm text-ink-muted">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-4 text-action" />
            <span className={`${displayFont.className} font-bold text-ink`}>Unpatched</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/safe-harbor" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
              Safe Harbor & Code of Conduct
            </Link>
            <Link href="/sign-in" className="font-semibold hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** An operational launchpad, not a statistics dashboard: one real fact list, one primary
 * action derived from what actually needs the signed-in user's attention right now --
 * never a tile grid of equally-weighted numbers. Every count here is exact (a real
 * COUNT or a complete, non-paginated list), never a partial page's `.length`, and no
 * bounty totals, rankings, SLAs, or synthetic activity appear anywhere on this screen. */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;

  // Context check first, before any researcher-only data is fetched -- an org-only
  // account (real organization membership, zero real researcher participation) gets
  // /organizations, never this researcher dashboard's CTF/reputation/leaderboard content
  // wearing one small footer link. Both signals are the same ones AppShell/AppShellClient
  // already use for nav (services/organizations.ts's hasAnyOrganizationMembership,
  // services/program-researchers.ts's listMyProgramParticipations) -- no new query, no
  // role column, matching lib/auth/default-destination.ts's determineDefaultDestination()
  // rule exactly. Every other account -- researcher-only, both, or neither yet -- lands
  // here, including right after sign-in: HomePage is this app's real researcher
  // dashboard, not /programs (the public program registry).
  const [participations, hasOrganization] = await perfTimed("HomePage gate batch (participations+hasOrg)", () =>
    Promise.all([listMyProgramParticipations(), hasAnyOrganizationMembership(user.id)]),
  );
  const hasResearcherParticipation = participations.length > 0;
  if (hasOrganization && !hasResearcherParticipation) redirect("/organizations" as Route);

  const [invitations, dashboardSummary, reputationLedgerPage, reputationProgramCounts, myReportsPage, featuredPrograms, leaderboard, reputationScore, paymentObligations] =
    await perfTimed("HomePage 9-query dashboard batch", () =>
      Promise.all([
        listMyPendingProgramInvitations(),
        // Replaces four separate round trips (getMyReputationSummary,
        // getMyReputationSeverityCounts, getMyReportStatusCounts,
        // countMyReportsNeedingResponse) with one combined RPC -- see
        // services/home-dashboard.ts and supabase/migrations/202609070001_home_dashboard_summary.sql.
        // Those four functions are unchanged and still exist for any other caller.
        getMyHomeDashboardSummary(),
        getMyReputationLedger(user.id),
        getMyReputationProgramCounts(user.id),
        // Large single page, not full pagination -- only joins report title/program name onto
        // the ledger's own evidence rows (see components/reputation/reputation-ledger.tsx),
        // matching the identical call on app/researchers/page.tsx, whose real reputation
        // section is embedded below rather than duplicated.
        listMyReports(user.id, undefined, MAX_PAGE_SIZE),
        // Real, currently-active-bounty-policy programs only, capped to a small dashboard
        // count -- the same query app/programs/page.tsx's own "Highest-paying programs"
        // section uses, never lib/mock/researcher-dashboard's fabricated MOCK_FEATURED_PROGRAMS.
        listTopBountyPrograms(3),
        // Real leaderboard (get_public_leaderboard), the same query app/researchers/page.tsx
        // itself uses -- StandingSplit renders a top-8 slice of this, never
        // lib/mock/researcher-dashboard's fabricated MOCK_LEADERBOARD.
        getPublicLeaderboard(8),
        getResearcherReputationScore(user.id),
        // Real payment_obligations ledger, the same query app/bounties/page.tsx and
        // app/settings/payments/page.tsx already use -- feeds CommandRow's real
        // "lifetime rewards" stat, replacing the fabricated MOCK_RESEARCHER_STATUS figure.
        listMyPaymentObligations(user.id),
      ]),
    );
  const { reputationSummary: reputationCounts, reputationSeverityCounts, reportStatusCounts, reportsNeedingResponse } = dashboardSummary;
  const activePrograms = participations.filter((p) => p.status === "active");

  const researcherStatus = computeResearcherDashboardStatus({
    activeProgramCount: activePrograms.length,
    reportStatusCounts,
    reputationScore,
    paymentObligations,
  });

  const reputationEvidenceByReportId: Record<string, { title: string; programName: string }> = {};
  const reputationProgramNames = new Map<string, string>();
  for (const report of myReportsPage.items) {
    reputationEvidenceByReportId[report.id] = { title: report.title, programName: report.programName };
    reputationProgramNames.set(report.programId, report.programName);
  }
  const hasReputationHistory = reputationLedgerPage.items.length > 0 || reputationCounts.some((entry) => entry.count > 0);

  // The one real next step, in priority order -- identical logic to before, only the
  // presentation is new. A large PrimaryActionPanel replaces the previous small
  // ink-filled text link so this reads as the page's one dominant action, not one line
  // among several.
  const primaryAction: { eyebrow: string; title: string; description: string; label: string; href: Route } =
    reportsNeedingResponse > 0
      ? {
          eyebrow: "Action required",
          title: `${reportsNeedingResponse} report${reportsNeedingResponse === 1 ? "" : "s"} waiting on you`,
          description: "An organization has requested more information on at least one of your reports.",
          label: "Respond to reports",
          href: "/reports" as Route,
        }
      : invitations.length > 0
        ? {
            eyebrow: "Waiting on you",
            title: `${invitations.length} pending program invitation${invitations.length === 1 ? "" : "s"}`,
            description: "An organization has invited you to research one of its programs.",
            label: "Review invitations",
            href: "/programs" as Route,
          }
        : {
            eyebrow: "Research",
            title: "Find your next security target",
            description: activePrograms.length > 0 ? "Browse the programs you can research, or discover a new public program." : "Browse public programs open to the community, or wait for an invitation.",
            label: "Browse programs",
            href: "/programs" as Route,
          };

  const activityWeeks = computeReportActivityWeeks(myReportsPage.items);

  // Command-center recomposition: four purposeful zones instead of a long stack of
  // equal-weight card sections. CommandRow is the one dominant asymmetric moment (what
  // needs attention + the stat rail); OperationalGrid, StandingSplit, and ReferenceStrip
  // step down in urgency/weight in that order, each its own dense bordered surface rather
  // than N separate full-width cards. See docs/decisions/0058 for the rationale.
  //
  // AppShell's title is now primaryAction.title -- the real, dynamically-computed action
  // identity ("3 reports waiting on you", "Find your next security target") -- never the
  // generic, always-identical word "Dashboard". This makes the shell's own <h1> (rendered
  // once, in AppShellClient's header bar) the screen's one real heading, with CommandRow's
  // own former <h2> now plain text repeating it for visual weight inside the dark panel
  // (see command-row.tsx's own comment). The greeting below is supporting text, not a
  // second heading -- it was never a real section, just a personalized aside.
  return (
    <AppShell title={primaryAction.title} user={user}>
      <div className="max-w-6xl space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-ink-muted">{user.displayName ? `Welcome back, ${user.displayName}` : "Your security workspace"}</p>
          <span className="font-mono text-xs text-ink-muted">
            {reportsNeedingResponse > 0
              ? `${reportsNeedingResponse} report${reportsNeedingResponse === 1 ? "" : "s"} waiting on your response`
              : invitations.length > 0
                ? `${invitations.length} pending invitation${invitations.length === 1 ? "" : "s"}`
                : "No action waiting on you"}
          </span>
        </div>

        <CommandRow action={primaryAction} status={researcherStatus} />

        <OperationalGrid activePrograms={activePrograms} featuredPrograms={featuredPrograms} challenges={MOCK_CHALLENGE_SPOTLIGHT} />

        <LearningSection categories={MOCK_CHALLENGE_CATEGORIES} />

        <StandingSplit reputationCounts={reputationCounts} hasReputationHistory={hasReputationHistory} leaderboardRows={leaderboard} />

        {hasReputationHistory && (
          <div className="rounded-xl border-l-4 border-l-action bg-surface-raised p-6 shadow-sm">
            <SectionLabel>Verified impact</SectionLabel>
            <h2 className="mt-0.5 text-base font-semibold text-ink">Reputation detail</h2>
            <div className="mt-4 space-y-6">
              <ReputationCharts counts={reputationCounts} severityCounts={reputationSeverityCounts} />
              <ReputationProgramContext programCounts={reputationProgramCounts} programNames={reputationProgramNames} />
              <ReputationLedgerSection initialEntries={reputationLedgerPage.items} initialNextCursor={reputationLedgerPage.nextCursor} evidenceByReportId={reputationEvidenceByReportId} />
            </div>
          </div>
        )}

        <ReferenceStrip activityWeeks={activityWeeks} />

        <div className="border-t border-border pt-4 text-xs text-ink-muted">
          <p>When an organization requests information on a report, it appears here and in Notifications.</p>
          {/* Only shown to someone who already belongs to an organization — for anyone
              else, /organizations is the identical dead end the sidebar's own
              Organization nav group is hidden for (see docs/decisions/0044/0048): its
              only content is "you don't have one yet, create one," which is not a real
              next step to surface on a researcher's own home screen. */}
          {hasOrganization && (
            <Link href="/organizations" className="mt-2 inline-block font-medium text-ink-muted hover:text-ink">
              Manage an organization instead?
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
