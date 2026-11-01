import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { ToneBadge, TONE } from "../../../components/ui/badge";
import { LocalTime } from "../../../components/ui/local-time";
import { AddAnalyst, AdminCancelSubscription, DecideSubscription, RemoveAnalyst, RevokeAnalystInvitation } from "../../../components/managed-triage/forms";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { listAnalystInvitations, listAnalysts, listSubscriptionsForAdmin } from "../../../services/managed-triage";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { formatMoney } from "../../../lib/money";

const STATUS_TONE = { requested: TONE.warning, active: TONE.success, past_due: TONE.danger, cancelled: TONE.muted, declined: TONE.muted } as const;

/** Managed Triage requests, subscriptions and the analyst roster (202610290008). */
export default async function PlatformManagedTriagePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/managed-triage" as Route);
  if (!(await isPlatformAdmin())) notFound();
  const [subscriptions, analysts, invitations] = await Promise.all([listSubscriptionsForAdmin(), listAnalysts(), listAnalystInvitations()]);

  return (
    <AppShell title="Managed Triage" user={user}>
      <div className="max-w-5xl space-y-8">
        <section className="space-y-3">
          <SectionLabel>Organizations</SectionLabel>
          {subscriptions.length === 0 ? (
            <EmptyState title="No requests yet">Organizations request Managed Triage from their own Managed Triage page.</EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {subscriptions.map((s) => (
                <li key={s.organizationId} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                        {s.organizationName}
                        <ToneBadge tone={STATUS_TONE[s.status]}>{s.status.replace("_", " ")}</ToneBadge>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {s.planName} · {formatMoney(s.monthlyPriceMinorUnits, s.currency)} / month · requested by {s.requestedByName ?? "a member"} <LocalTime value={s.requestedAt} dateOnly />
                        {s.paidThrough && ` · paid through ${s.paidThrough}`} · {s.openReports} open report{s.openReports === 1 ? "" : "s"}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">Available balance: {s.availableMinorUnits === null ? "none" : formatMoney(s.availableMinorUnits, s.currency)}</p>
                      {s.decisionNote && <p className="mt-0.5 text-xs text-ink-muted">Note: {s.decisionNote}</p>}
                    </div>
                    {(s.status === "active" || s.status === "past_due") && <AdminCancelSubscription organizationId={s.organizationId} />}
                  </div>
                  {s.status === "requested" && <DecideSubscription organizationId={s.organizationId} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <SectionLabel>Triage analysts</SectionLabel>
          <p className="text-sm text-ink-muted">Analysts work every report of an organization with an active subscription. They need two-factor authentication and may not belong to any organization.</p>
          <AddAnalyst />
          {invitations.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Waiting to join</p>
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <div>
                      <p className="text-sm font-medium text-ink">{i.email}</p>
                      <p className="text-xs text-ink-muted">
                        Invited by {i.invitedByName ?? "an admin"} <LocalTime value={i.createdAt} dateOnly /> · link expires <LocalTime value={i.expiresAt} dateOnly />
                      </p>
                    </div>
                    <RevokeAnalystInvitation invitationId={i.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {analysts.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {analysts.map((a) => (
                <li key={a.userId} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      {a.displayName}
                      {!a.hasMfa && <ToneBadge tone={TONE.warning}>No 2FA yet</ToneBadge>}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {a.email} · {a.openClaims} claimed · {a.actions30d} report actions in 30 days
                    </p>
                  </div>
                  <RemoveAnalyst userId={a.userId} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
