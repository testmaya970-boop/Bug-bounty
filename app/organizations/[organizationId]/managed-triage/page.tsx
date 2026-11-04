import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { Alert, PermissionDenied } from "../../../../components/ui/feedback";
import { ToneBadge, TONE } from "../../../../components/ui/badge";
import { LocalTime } from "../../../../components/ui/local-time";
import { SectionLabel } from "../../../../components/ui/security-primitives";
import { PageSummary, type SummaryBadge } from "../../../../components/ui/page-summary";
import { CancelSubscription, EscalationItem, PlanPicker, ResumeSubscription } from "../../../../components/managed-triage/forms";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { getActorMembership } from "../../../../services/organization-members";
import { getPerformance, getSubscription, listOrganizationEscalations, listPlans, listServiceCharges } from "../../../../services/managed-triage";
import { formatMoney } from "../../../../lib/money";

const STATUS = {
  requested: { label: "Waiting for Unpatched to confirm", tone: TONE.warning },
  active: { label: "Active", tone: TONE.success },
  past_due: { label: "Paused: renewal not paid", tone: TONE.danger },
  cancelled: { label: "Cancelled", tone: TONE.muted },
  declined: { label: "Declined", tone: TONE.muted },
} as const;
const pct = (met: number, of: number) => (of > 0 ? `${Math.round((met / of) * 100)}%` : "--");
const BADGE_TONE = { requested: "warning", active: "success", past_due: "warning", cancelled: "neutral", declined: "neutral" } as const;
const STEPS = ["Validate the report", "Reproduce it", "Check for duplicates", "Set severity", "Ask you when it needs your call"];

/** Managed Triage: buy it, watch how it performs, and answer the analysts' questions. */
export default async function ManagedTriagePage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/managed-triage` as Route);
  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || (actor.role !== "owner" && actor.role !== "security_admin")) {
    return (
      <AppShell title="Managed Triage" user={user} organizationId={organizationId}>
        <PermissionDenied>Managed Triage is managed by owners and security admins.</PermissionDenied>
      </AppShell>
    );
  }
  const [plans, sub] = await Promise.all([listPlans(), getSubscription(organizationId)]);
  const live = sub && (sub.status === "active" || sub.status === "past_due" || sub.status === "requested");
  const [performance, escalations, charges] = sub && sub.status !== "requested" && live
    ? await Promise.all([getPerformance(organizationId), listOrganizationEscalations(organizationId), listServiceCharges(organizationId)])
    : [null, [], sub ? await listServiceCharges(organizationId) : []];
  const plan = plans.find((p) => p.code === sub?.planCode);
  const summaryBadges: SummaryBadge[] = sub && live
    ? [{ label: `${plan?.name ?? sub.planCode} plan`, tone: "info" }, { label: STATUS[sub.status].label, tone: BADGE_TONE[sub.status] }]
    : [{ label: "Not subscribed", tone: "neutral" }];

  return (
    <AppShell title="Managed Triage" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: "Organization", href: `/organizations/${organizationId}` }, { label: "Managed Triage" }]} />

        <PageSummary
          description="Unpatched analysts validate, reproduce and triage your reports on agreed response times. They never decide or pay bounties, change program settings, or use your integrations; every action they take is in your audit log."
          badges={summaryBadges}
          metrics={performance ? [
            { label: "First response on time", value: pct(performance.firstResponseMet, performance.firstResponseMeasured), detail: `${performance.firstResponseMet} of ${performance.firstResponseMeasured} reports` },
            { label: "Triaged on time", value: pct(performance.triageMet, performance.triageMeasured), detail: `${performance.triageMet} of ${performance.triageMeasured} reports` },
            { label: "Reports handled", value: String(performance.reportsHandled), detail: `${performance.assessments} validations recorded` },
            { label: "Waiting for you", value: String(performance.openEscalations), detail: "Questions from analysts", tone: performance.openEscalations > 0 ? "warning" : "neutral" },
          ] : []}
        />

        <ol aria-label="How analysts work a report" className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] font-medium text-ink">
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF] font-mono text-[11px] font-semibold text-[#1D4ED8]">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>

        {sub && live ? (
          <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <SectionLabel>Your plan</SectionLabel>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
                  {plan?.name ?? sub.planCode} · {formatMoney(sub.monthlyPriceMinorUnits, sub.currency)} / month
                  <ToneBadge tone={STATUS[sub.status].tone}>{STATUS[sub.status].label}</ToneBadge>
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {plan && `First response within ${plan.firstResponseTargetHours}h, triaged within ${plan.triageTargetHours}h. `}
                  {sub.status === "active" && sub.paidThrough && `Paid through ${sub.paidThrough}; renews from your prepaid balance.`}
                  {sub.status === "requested" && <>Requested <LocalTime value={sub.requestedAt} />.</>}
                </p>
              </div>
              <CancelSubscription organizationId={organizationId} active={sub.status !== "requested"} />
            </div>
            {sub.status === "past_due" && (
              <Alert tone="danger" title="Analysts are paused">
                The monthly renewal of {formatMoney(sub.monthlyPriceMinorUnits, sub.currency)} was more than your available balance.{" "}
                <Link prefetch={false} href={`/organizations/${organizationId}/payments/add-funds` as Route} className="font-medium text-action">
                  Add funds
                </Link>
                , then resume.
                <div className="mt-2">
                  <ResumeSubscription organizationId={organizationId} />
                </div>
              </Alert>
            )}
          </section>
        ) : (
          <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
            <SectionLabel>Choose a plan</SectionLabel>
            {sub?.status === "declined" && sub.decisionNote && <Alert tone="warning" title="Your last request was declined">{sub.decisionNote}</Alert>}
            <PlanPicker organizationId={organizationId} plans={plans} defaultCurrency={sub?.currency ?? "USD"} />
          </section>
        )}

        {escalations.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Questions from analysts</h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface px-4">
              {escalations.map((e) => (
                <EscalationItem key={e.id} e={e} canAnswer reportHref={`/organizations/${organizationId}/programs/${e.programId}/reports/${e.reportId}`} />
              ))}
            </ul>
          </section>
        )}

        {charges.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Charges</h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {charges.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="text-ink">
                    {c.description}
                    <span className="block text-xs text-ink-muted">
                      <LocalTime value={c.createdAt} dateOnly /> · {c.automatic ? "Monthly renewal" : "Charged on activation"} · from your prepaid balance
                    </span>
                  </span>
                  <span className="font-mono text-ink">{formatMoney(c.amountMinorUnits, c.currency)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
