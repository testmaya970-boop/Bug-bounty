import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { CheckCircle, Circle, Clock, RocketLaunch } from "@phosphor-icons/react/dist/ssr";
import type { OrganizationOnboarding } from "../../services/onboarding";
import { cn } from "../../lib/cn";

// The organization's path from sign-up to a public program (Oct 23 onboarding plan): seven
// stages, each step done or not from real data, with the link that does it. Shown in full on
// Home until the first program launches; after that only what is still open, then nothing.

type Step = { label: string; done: boolean; href: string; optional?: boolean; hint?: string; waiting?: boolean };
type Stage = { title: string; steps: Step[] };

export function buildOnboardingStages(o: OrganizationOnboarding, organizationId: string): Stage[] {
  const org = `/organizations/${organizationId}`;
  const program = o.firstProgramId ? `${org}/programs/${o.firstProgramId}` : `${org}/programs`;
  const pilot = o.pilotProgramId ? `${org}/programs/${o.pilotProgramId}` : program;
  const pilotReady = o.pilotValidReports >= 3 || o.pilotDays >= 28;
  return [
    {
      title: "Account",
      steps: [
        { label: "Confirm company and billing details", done: o.billingProfile, href: `${org}/payments#billing-details`, hint: "Printed on every invoice. Your name is filled in already." },
        { label: "Turn on two-factor for every admin", done: o.adminsMfa, href: "/settings/security", hint: "Owners and security admins can see unreleased vulnerabilities." },
      ],
    },
    {
      title: "Workspace",
      steps: [
        { label: "Invite your team", done: o.teamInvited, href: `${org}/members`, hint: "Program managers run engagements; triagers work reports; billing admins handle payments." },
        { label: "Connect Jira", done: o.jiraConnected, href: `${org}/settings`, optional: true, hint: "Accepted reports become tickets, and fixes flow back." },
      ],
    },
    {
      title: "Program",
      steps: [
        { label: "Create your first engagement", done: o.programCreated, href: `${org}/programs`, hint: "A bounty program, or a disclosure program with no payouts." },
        { label: "Add what's in scope", done: o.scopeAdded, href: `${program}#scope`, hint: "Domains, apps or APIs researchers may test. Import a CSV to add many." },
        { label: "Publish the policy and response targets", done: o.policyPublished, href: program, hint: "Rules of engagement, safe harbor, and how fast you'll respond." },
        { label: "Set the bounty table", done: o.bountyTable, href: program, hint: "What you pay per severity. Tier-2 and tier-3 assets can pay less." },
      ],
    },
    {
      title: "Funding",
      steps: [{ label: "Add funds to your balance", done: o.funded, href: `${org}/payments`, hint: "About 3 times your top critical bounty is a good start. Set a budget per program in Budgets." }],
    },
    {
      title: "Launch review",
      steps: [
        {
          label: o.inReview ? "Unpatched is reviewing your program" : "Submit the engagement for review",
          done: o.launched,
          waiting: o.inReview,
          href: program,
          hint: o.inReview ? "We check scope, policy and funding within 2 business days and reply here." : "Unpatched checks it before any researcher sees it.",
        },
      ],
    },
    {
      title: "Private pilot",
      steps: [
        {
          label: "Invite researchers to a private pilot",
          done: o.researchersJoined,
          href: `${pilot}#researchers`,
          hint: "10 to 25 researchers for 2 to 4 weeks. Find proven ones on the leaderboard in Researchers.",
        },
      ],
    },
    {
      title: "Go public",
      steps: [
        {
          label: o.public ? "Your program is public" : pilotReady && o.pilotProgramName ? `${o.pilotProgramName} is ready to go public` : "Go public when the pilot is steady",
          done: o.public,
          optional: !pilotReady,
          href: `${pilot}`,
          hint: o.public
            ? "Every researcher can now find and join it."
            : `Pilot so far: ${o.pilotResearchers} researcher${o.pilotResearchers === 1 ? "" : "s"}, ${o.pilotValidReports} valid report${o.pilotValidReports === 1 ? "" : "s"}, ${o.pilotDays} days. We suggest public after 3 valid reports or 4 weeks with your response targets met. Pending invitations cancel automatically.`,
        },
      ],
    },
  ];
}

export function OnboardingChecklist({ onboarding, organizationId }: { onboarding: OrganizationOnboarding; organizationId: string }) {
  const stages = buildOnboardingStages(onboarding, organizationId);
  const required = stages.flatMap((s) => s.steps).filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  const open = stages.flatMap((s) => s.steps.map((step) => ({ ...step, stage: s.title }))).filter((s) => !s.done && !s.optional);

  // After the first launch: only what's still open, compact. Nothing once everything is done.
  if (onboarding.launched) {
    if (open.length === 0) return null;
    return (
      <section aria-label="Finish setup" className="rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-[13px] font-semibold text-ink">Finish setup</p>
        <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
          {open.map((s) => (
            <li key={s.label}>
              <Link prefetch={false} href={s.href as Route} className="inline-flex items-center gap-1.5 text-[13px] text-ink hover:text-action">
                <Circle aria-hidden="true" className="size-3.5 text-ink-muted" />
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const nextStep = open[0];
  return (
    <section aria-labelledby="onboarding" className="overflow-hidden rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4">
        <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-lg bg-action/10 text-action">
          <RocketLaunch weight="fill" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="onboarding" className="text-[15px] font-semibold text-ink">
            Launch {onboarding.organizationName} on Unpatched
          </h2>
          <p className="text-[13px] text-ink-muted">
            {done} of {required.length} steps done{nextStep ? ` · next: ${nextStep.label.toLowerCase()}` : ""}
          </p>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted sm:w-48" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={required.length} aria-valuenow={done}>
          <div className="h-full rounded-full bg-action transition-[width]" style={{ width: `${(done / required.length) * 100}%` }} />
        </div>
      </header>
      <ol className="divide-y divide-border">
        {stages.map((stage, i) => (
          <li key={stage.title} className="grid grid-cols-1 gap-2 px-5 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <p className="pt-0.5 text-xs font-medium text-ink-muted">
              {i + 1}. {stage.title}
            </p>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 lg:grid-cols-2">
              {stage.steps.map((step) => (
                <li key={step.label}>
                  <Link prefetch={false} href={step.href as Route} className="group flex gap-2">
                    {step.done ? (
                      <CheckCircle aria-label="Done" weight="fill" className="mt-0.5 size-4 shrink-0 text-success" />
                    ) : step.waiting ? (
                      <Clock aria-label="Waiting" weight="bold" className="mt-0.5 size-4 shrink-0 text-warning" />
                    ) : (
                      <Circle aria-label="To do" className={cn("mt-0.5 size-4 shrink-0", step === nextStep ? "text-action" : "text-ink-muted")} />
                    )}
                    <span className="min-w-0">
                      <span className={cn("block text-[13px] group-hover:text-action", step.done ? "text-ink-muted line-through decoration-border-strong" : "font-medium text-ink")}>
                        {step.label}
                        {step.optional && !step.done && <span className="ml-1.5 text-[11px] font-normal text-ink-muted">optional</span>}
                      </span>
                      {!step.done && step.hint && <span className="mt-0.5 block text-xs text-ink-muted">{step.hint}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
