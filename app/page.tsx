import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { SectionLabel } from "../components/ui/security-primitives";
import { HeroArt } from "../components/marketing/hero-art/hero-art";
import { BugSpecimen } from "../components/marketing/hero-art/bug-specimen";
import { AuditSeal } from "../components/marketing/hero-art/audit-seal";
import { WorkflowDiagramPair } from "../components/marketing/workflow-diagram";
import { PublicHomeMotion } from "../components/marketing/public-home-motion";
import { ProgramDiscoveryPreview } from "../components/marketing/program-discovery-preview";
import { StateMachineDiagram } from "../components/marketing/state-machine-diagram";
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

// Tactical Telemetry reskin (taste-skill:industrial-brutalist-ui): this page reads the
// same single-substrate tokens as every other screen, and headings use the app-wide heavy
// display face (Archivo Black, via globals.css's h1/h2 rule) -- the page's former private
// display font (Plus Jakarta Sans) is gone, one fewer font download.
const headingClass = "font-display text-ink";

// Every pressable link keeps real press feedback (scale(0.97) on :active) with explicit
// transition properties, never the `transition`/`transition-all` shorthand.
// Tactical Telemetry: square slabs, uppercase mono labels. The primary CTA is the
// page's one solid hazard-red block (dark text -- white on this red fails AA at 3.7:1).
const primaryLinkClass =
  "inline-flex min-h-12 items-center gap-2 rounded-md bg-action px-7 text-sm font-semibold text-on-action transition-[transform,background-color] duration-200 ease-out hover:bg-action-hover active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const secondaryLinkClass =
  "inline-flex min-h-12 items-center gap-2 rounded-md border border-border-strong bg-surface px-7 text-sm font-semibold text-ink transition-[transform,background-color,color] duration-200 ease-out hover:border-action hover:bg-surface-hover active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// The `+`/rotate icon gets an explicit duration/ease (was `transition-transform` alone,
// resolving to Tailwind's default 150ms/default ease -- fine, but undocumented). The
// answer text no longer just snaps into existence with the native <details> toggle: a
// short fade + lift on open makes the reveal feel like content arriving, not a layout
// jump. Occasional-tier interaction (a handful of opens per visit), so a standard
// animation is warranted -- but it must still sit under the 300ms UI ceiling, which is
// why this uses enter-rise (220ms, 4px lift), not hero-reveal (500ms, 16px lift, sized
// for a page section entering on scroll, not a FAQ answer appearing on click).
function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group border-t border-border py-5 transition-colors duration-200 ease-out motion-reduce:transition-none">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-ink [&::-webkit-details-marker]:hidden">
        {question}
        <span aria-hidden="true" className="shrink-0 text-xl text-ink-muted transition-transform duration-200 ease-out group-open:rotate-45 motion-reduce:transition-none">
          +
        </span>
      </summary>
      <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ink-muted motion-safe:animate-enter-rise">{answer}</p>
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
      <PublicHomeMotion />
      {/* NAVIGATION (docs/decisions/0083, chaptered-editorial grammar) -- no fixed
          bar: the grammar explicitly forbids the pill-shaped sticky wordmark+CTA
          bar every earlier version of this page carried. A plain top rule with
          the wordmark and two real entry points, in document flow, not fixed. */}
      <header className="border-b border-border px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-5 text-action" />
            <span className="font-display text-lg uppercase tracking-tight">Unpatched</span>
          </div>
          <div className="flex items-center gap-5 text-sm font-semibold text-ink-muted">
            <Link prefetch={false} href="/sign-in" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
              Sign in
            </Link>
            <Link prefetch={false} href="/programs" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
              Programs
            </Link>
          </div>
        </div>
      </header>

        <main>
          {/* TITLE PAGE (docs/decisions/0082/0083) -- the chaptered-editorial hero:
              type on the paper ground, the hero-art bleeding off both edges as the
              only imagery above the fold. Headline/copy/buttons unchanged. */}
          <section className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
            <HeroArt />
            <div className="relative mx-auto max-w-2xl text-center">
              <h1 data-motion="hero-heading" className={`${headingClass} text-4xl leading-[1.05] sm:text-5xl lg:text-[3.4rem]`}>
                Every finding becomes a record no one can quietly change.
              </h1>
              <p data-motion="hero-copy" className="mx-auto mt-6 max-w-xl text-base text-ink-muted sm:text-lg">
                Researchers submit real findings. Organizations triage and decide. Every step, evidence, response, and resolution is written once and never silently overwritten.
              </p>
              <div data-motion="hero-ctas" className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link prefetch={false} href={"/researchers/sign-up" as Route} className={primaryLinkClass}>
                  Explore security research <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
                <Link prefetch={false} href={"/organizations/sign-up" as Route} className={secondaryLinkClass}>
                  Run a security program
                </Link>
              </div>
            </div>
          </section>

          {/* CHAPTER ONE — SIGNAL / EVIDENCE (docs/decisions/0083). Hard-cut ground
              (per devices.md §10: a chaptered page paints grounds per section, never
              drifts between them), the bug specimen full and real, its own callout
              labels read as case annotations rather than decoration -- the same real
              SVG this session already built, given a real chapter instead of sharing
              the hero with the title page. */}
          <section id="how-it-works" className="relative overflow-hidden border-t border-border bg-surface px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
              <div className="relative z-10">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-ink-muted"><span aria-hidden="true" className="text-action">[ 01 ] /// </span>Chapter one</p>
                <h2 data-motion="chapter-heading" className={`${headingClass} mt-3 text-3xl sm:text-4xl`}>Signal, then evidence.</h2>
                <p data-motion="chapter-body" className="mt-4 max-w-[62ch] text-base leading-relaxed text-ink-muted">
                  A researcher notices something worth a second look. Domains, URLs, or IP ranges: the single most-specific scope match decides what&rsquo;s authorized before anyone tests anything. Text,
                  code, request/response logs, or a file, up to 10 MB, attached at submission or added afterward.
                </p>
              </div>
              <figure data-motion="chapter-figure" className="chapter-art-full relative -mx-4 h-[52vh] min-h-[360px] sm:-mx-6 lg:mx-0 lg:h-[64vh]" aria-hidden="true">
                <BugSpecimen />
                <figcaption className="sr-only">A specimen-plate diagram of a security finding, annotated with real vulnerability classes: unvalidated input, broken access control, session token exposed, outdated dependency.</figcaption>
              </figure>
            </div>
          </section>

          {/* CHAPTER TWO — FINDING / TRIAGE. Hard-cut ground change (bg-surface-muted,
              not an interpolated drift), the real state-machine diagram as the
              chapter's one real "second-read" moment. */}
          <section className="border-t border-border bg-surface-muted px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto max-w-4xl">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-ink-muted"><span aria-hidden="true" className="text-action">[ 02 ] /// </span>Chapter two</p>
              <h2 data-motion="chapter-heading" className={`${headingClass} mt-3 text-3xl sm:text-4xl`}>Not a status field. A state machine.</h2>
              <p data-motion="chapter-body" className="mt-4 max-w-[62ch] text-base leading-relaxed text-ink-muted">
                Every report moves through a fixed, real transition table — the exact same one that runs in production, not a simplified version for this page.
              </p>
              <div data-motion="chapter-figure" className="mt-12">
                <StateMachineDiagram />
              </div>
            </div>
          </section>

          {/* CHAPTER THREE — DECISION / FIX / VERIFICATION. Two real paths (the
              researcher path, the organization path) as one shared WorkflowDiagramPair
              grid, step N of one aligned with step N of the other -- per taste.md's
              "media never bleeds under type" rule for this grammar, not a rounded
              tinted card. */}
          <section id="for-researchers" className="border-t border-border bg-surface px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto max-w-6xl">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-ink-muted"><span aria-hidden="true" className="text-action">[ 03 ] /// </span>Chapter three</p>
              <h2 data-motion="chapter-heading" className={`${headingClass} mt-3 max-w-2xl text-3xl sm:text-4xl`}>Decision, fix, verification: two real paths through the same record.</h2>
              <div className="mt-12 grid gap-6 lg:grid-cols-2 lg:gap-12">
                <h3 className="text-xl font-bold text-ink lg:pr-12">Find real work. Keep the record.</h3>
                <h3 id="for-organizations" className="text-xl font-bold text-ink lg:pl-12">
                  Run a program, not a vulnerability inbox.
                </h3>
              </div>
              <div data-motion="chapter-figure" className="mt-6">
                <WorkflowDiagramPair left={RESEARCHER_STAGES} right={ORGANIZATION_STAGES} />
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:gap-12">
                <Link prefetch={false} href={"/researchers/sign-up" as Route} className="inline-block border-b border-ink text-sm font-semibold text-ink hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:pr-12">
                  Continue as researcher
                </Link>
                <Link prefetch={false} href={"/organizations/sign-up" as Route} className="inline-block border-b border-ink text-sm font-semibold text-ink hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:pl-12">
                  Continue as organization
                </Link>
              </div>
            </div>
          </section>

        {/* CHAPTER FOUR — RECORD (docs/decisions/0083). The peak, per BRIEF.md's
            feeling curve: the audit seal, full, its own real ring text (RECEIVED /
            TRIAGED / DECIDED / RECORDED) read as the chapter's own thesis restated
            rather than decoration, and PHILOSOPHY_STAGES's six real facts set as
            plain prose, not a tinted rounded card. The largest span on the page,
            and the quiet chapter-three ground change is its silence-before, per
            feel.md's peak rules. */}
        <section className="relative overflow-hidden border-t border-border bg-surface-muted px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <figure data-motion="chapter-figure" className="chapter-art-full relative order-2 -mx-4 h-[52vh] min-h-[360px] sm:-mx-6 lg:order-1 lg:mx-0 lg:h-[68vh]" aria-hidden="true">
              <AuditSeal />
              <figcaption className="sr-only">A notary-style audit seal, its ring reading RECEIVED, TRIAGED, DECIDED, RECORDED -- the real Unpatched report lifecycle.</figcaption>
            </figure>
            <div className="relative z-10 order-1 lg:order-2">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-ink-muted"><span aria-hidden="true" className="text-action">[ 04 ] /// </span>Chapter four</p>
              <h2 data-motion="chapter-heading" className={`${headingClass} mt-3 text-3xl sm:text-4xl`}>Security work should leave a record.</h2>
              <p data-motion="chapter-body" className="mt-4 max-w-[54ch] text-base leading-relaxed text-ink-muted">Not a status that quietly changed. Not a decision no one can trace back to a reason.</p>
              <dl data-motion="chapter-body" className="mt-8 space-y-5 border-t border-border pt-6">
                {PHILOSOPHY_STAGES.map((stage) => (
                  <div key={stage.label}>
                    <dt className="text-sm font-bold text-ink">{stage.label}</dt>
                    <dd className="mt-1 max-w-[54ch] text-sm leading-relaxed text-ink-muted">{stage.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* FAQ — flowed short, per feel.md §5's "compress the administrative
            parts" rule: information the reader will use, not experience they'll
            remember, so it stays a plain divided list, not another chapter. Real
            questions about Unpatched's real, current constraints, unchanged. */}
        <section className="border-t border-border px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className={`${headingClass} text-2xl sm:text-3xl`}>Frequently asked questions</h2>
            <div className="mt-2">
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

        {/* CLOSE — a colophon plate, not a magnetic CTA island (both are banned by
            the chaptered-editorial grammar, uniqueness.md §2.2). Stays on the same
            paper ground as the rest of the page -- taste.md's own rule against a
            single dark section breaking an otherwise light page, which every
            earlier version of this homepage violated with two separate bg-ink
            bands. The CTA is set as running text. */}
        <section className="border-t border-border px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-ink-muted"><span aria-hidden="true">[ </span>REC-0000842<span aria-hidden="true"> ] /// </span>closed</p>
            <h2 className={`${headingClass} mt-4 text-2xl sm:text-3xl`}>The record does not disappear.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
              <Link prefetch={false} href={"/researchers/sign-up" as Route} className="border-b border-ink font-semibold text-ink hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                Continue as researcher
              </Link>
              {" · "}
              <Link prefetch={false} href={"/organizations/sign-up" as Route} className="border-b border-ink font-semibold text-ink hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                Continue as organization
              </Link>
            </p>
          </div>
        </section>
      </main>
      <footer className="border-t border-border px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="size-5 text-action" />
                <span className="font-display text-lg uppercase text-ink">Unpatched</span>
              </div>
              <p className="mt-3 max-w-xs text-sm text-ink-muted">Every finding becomes a record no one can quietly change.</p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Product</p>
              <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
                <li>
                  <Link prefetch={false} href="/programs" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
                    Browse programs
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/learn" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
                    Learn
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/ctf" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
                    CTF challenges
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Get started</p>
              <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
                <li>
                  <Link prefetch={false} href={"/researchers/sign-up" as Route} className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
                    For researchers
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href={"/organizations/sign-up" as Route} className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
                    For organizations
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/sign-in" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
                    Sign in
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Trust</p>
              <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
                <li>
                  <Link prefetch={false} href="/safe-harbor" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
                    Safe Harbor & Code of Conduct
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/disclosures" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
                    Disclosures
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/help" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
                    Help
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-ink-muted">
            <p>© {new Date().getFullYear()} Unpatched.</p>
            <p className="font-mono">Every report moves through the same recorded path.</p>
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
  return perfTimed("route: researcher dashboard (total)", () => renderHomePage());
}

async function renderHomePage() {
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
            <Link prefetch={false} href="/organizations" className="mt-2 inline-block font-medium text-ink-muted hover:text-ink">
              Manage an organization instead?
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
