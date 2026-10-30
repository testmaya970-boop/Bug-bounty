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
import { StatTile } from "../../../../components/charts/stat-tile";
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

  return (
    <AppShell title="Managed Triage" user={user} organizationId={organizationId}>
      <div className="max-w-5xl space-y-6">
        <Breadcrumbs items={[{ label: "Organization", href: `/organizations/${organizationId}` }, { label: "Managed Triage" }]} />

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">Unpatched analysts triage your reports</h2>
          <p className="max-w-3xl text-sm text-ink-muted">
            Analysts validate every new report, reproduce it, check for duplicates, set severity, talk to the researcher and move the report through triage on agreed response times.
            Anything that needs your judgement comes to you as a question. They never decide or pay bounties, change program settings, or use your integrations; every action they take is in your audit log.
          </p>
        </section>

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

        {performance && (
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <StatTile label="First response on time" value={pct(performance.firstResponseMet, performance.firstResponseMeasured)} hint={`${performance.firstResponseMet} of ${performance.firstResponseMeasured} reports`} />
            <StatTile label="Triaged on time" value={pct(performance.triageMet, performance.triageMeasured)} hint={`${performance.triageMet} of ${performance.triageMeasured} reports`} />
            <StatTile label="Reports handled" value={String(performance.reportsHandled)} hint={`${performance.assessments} validations recorded`} />
            <StatTile label="Waiting for you" value={String(performance.openEscalations)} hint="Questions from analysts" />
          </div>
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
