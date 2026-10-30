import React from "react";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { EmptyState, Alert } from "../../components/ui/feedback";
import { SeverityBadge, StatusBadge, ToneBadge, TONE } from "../../components/ui/badge";
import { QueueClaimButton } from "../../components/managed-triage/forms";
import { getCurrentUser } from "../../lib/auth/current-user";
import { getMyPlatformStaff, listQueue, type QueueItem, type QueueView } from "../../services/managed-triage";

const VIEWS: { key: QueueView; label: string }[] = [
  { key: "unclaimed", label: "Unclaimed" },
  { key: "mine", label: "Mine" },
  { key: "escalated", label: "Waiting on customer" },
  { key: "all", label: "All open" },
];

function duration(ms: number): string {
  const h = Math.abs(ms) / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

/** The next SLA checkpoint still open, as "due in 3h" or "overdue 2h". */
function Sla({ item, now }: { item: QueueItem; now: number }) {
  const next = !item.firstRespondedAt ? { label: "First response", due: item.firstResponseDueAt } : !item.triagedAt ? { label: "Triage", due: item.triageDueAt } : null;
  if (!next) return <span className="text-xs text-ink-muted">SLA met</span>;
  const left = new Date(next.due).getTime() - now;
  return (
    <ToneBadge tone={left < 0 ? TONE.danger : left < 4 * 3_600_000 ? TONE.warning : TONE.muted}>
      {next.label} {left < 0 ? `overdue ${duration(left)}` : `due in ${duration(left)}`}
    </ToneBadge>
  );
}

/** Managed Triage analysts' work queue across every subscribed organization, most urgent SLA first. */
export default async function TriageQueuePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/triage" as Route);
  const staff = await getMyPlatformStaff();
  if (!staff.triageAnalyst) {
    if (!staff.analystNeedsMfa) notFound();
    return (
      <AppShell title="Triage queue" user={user}>
        <Alert tone="warning" title="Turn on two-factor authentication">
          Triage analysts work on unpublished vulnerabilities, so the queue opens only on a session verified with an authenticator app.{" "}
          <Link prefetch={false} href={"/settings/security" as Route} className="font-medium text-action">
            Set it up in Security settings
          </Link>
          , then sign in again.
        </Alert>
      </AppShell>
    );
  }
  const { view: rawView } = await searchParams;
  const view = VIEWS.find((v) => v.key === rawView)?.key ?? "unclaimed";
  const items = await listQueue(view, null);
  const now = Date.now();

  return (
    <AppShell title="Triage queue" user={user}>
      <div className="max-w-6xl space-y-5">
        <p className="text-sm text-ink-muted">Reports from organizations on Managed Triage. Claim one, validate it, talk to the researcher, and ask the organization when a decision is theirs.</p>
        <nav aria-label="Queue" className="flex gap-1 overflow-x-auto border-b border-border">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              prefetch={false}
              href={`/triage?view=${v.key}` as Route}
              aria-current={v.key === view ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm ${v.key === view ? "border-action font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
            >
              {v.label}
            </Link>
          ))}
        </nav>

        {items.length === 0 ? (
          <EmptyState title="Nothing here">{view === "unclaimed" ? "Every open report has an analyst." : "No reports in this view."}</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {items.map((item) => (
              <li key={item.reportId} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0 space-y-1.5">
                  <Link
                    prefetch={false}
                    href={`/organizations/${item.organizationId}/programs/${item.programId}/reports/${item.reportId}` as Route}
                    className="line-clamp-2 font-medium text-ink hover:text-action"
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {item.organizationName} · {item.programName} · {item.planCode === "priority" ? "Priority" : "Standard"} plan
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={item.status} />
                    {(item.confirmedSeverity ?? item.researcherSeverity) && <SeverityBadge severity={(item.confirmedSeverity ?? item.researcherSeverity)!} />}
                    <Sla item={item} now={now} />
                    {item.openEscalation && <ToneBadge tone={TONE.warning}>Question open</ToneBadge>}
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  {item.claimedBy ? (
                    <span className="text-xs text-ink-muted">{item.claimedBy === user.id ? "Yours" : `Claimed by ${item.claimedByName ?? "an analyst"}`}</span>
                  ) : (
                    <QueueClaimButton reportId={item.reportId} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
