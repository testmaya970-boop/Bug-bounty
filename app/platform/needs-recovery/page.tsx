import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { ReplayButton } from "../../../components/platform/replay-button";
import { isPlatformAdmin, listNeedsRecoveryNotificationDeliveries, listNeedsRecoveryOutboxEvents, listNeedsRecoveryPaymentAttempts } from "../../../services/platform-operations";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { formatDateTime } from "../../../lib/format-date";

/**
 * A non-admin gets a real 404, not a "Permission denied" page -- an unauthorized visitor
 * should not learn this route exists at all, let alone that it requires special
 * authority. This is the one platform-specific page this slice builds; it deliberately
 * has no shared sidebar navigation (AppShell is untouched) since there is nothing else
 * real to navigate to yet -- adding dead links for Needs Review/Intervention/
 * Investigation before they exist would violate this slice's own explicit scope limit.
 */
export default async function NeedsRecoveryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/needs-recovery" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const [outboxEvents, notificationDeliveries, paymentAttempts] = await Promise.all([
    listNeedsRecoveryOutboxEvents(),
    listNeedsRecoveryNotificationDeliveries(),
    listNeedsRecoveryPaymentAttempts(),
  ]);

  const hasAnyFailure = outboxEvents.length > 0 || notificationDeliveries.length > 0 || paymentAttempts.length > 0;

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Unpatched</span>
          <span className="border-l border-border-strong pl-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Platform operations</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SectionLabel>Platform operations</SectionLabel>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Needs recovery</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">Operational failures requiring attention, across every organization.</p>

        {!hasAnyFailure ? (
          <div className="mt-8">
            <EmptyState title="No unresolved operational failures">Unpatched is operating normally.</EmptyState>
          </div>
        ) : (
          <div className="mt-8 space-y-10">
            {outboxEvents.length > 0 && (
              <section aria-labelledby="needs-recovery-outbox">
                <h2 id="needs-recovery-outbox" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Outbox
                </h2>
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
                  {outboxEvents.map((event) => (
                    <li key={event.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-danger">Dead lettered · {formatDateTime(event.processedAt ?? event.occurredAt)}</p>
                        <p className="mt-1 text-sm font-medium text-ink">{event.eventType}</p>
                        <p className="mt-0.5 text-sm text-ink-muted">{event.organizationName}</p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {event.attempts}/{event.maxAttempts} attempts
                          {event.lastError && <> · {event.lastError}</>}
                        </p>
                      </div>
                      <ReplayButton eventId={event.id} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {notificationDeliveries.length > 0 && (
              <section aria-labelledby="needs-recovery-notifications">
                <h2 id="needs-recovery-notifications" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Notifications
                </h2>
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
                  {notificationDeliveries.map((delivery) => (
                    <li key={delivery.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-danger">Delivery failed permanently · {formatDateTime(delivery.updatedAt)}</p>
                        <p className="mt-1 text-sm font-medium text-ink">{delivery.notificationType}</p>
                        <p className="mt-0.5 text-sm text-ink-muted">
                          {delivery.organizationName} / {delivery.programName}
                        </p>
                        {delivery.lastError && <p className="mt-1 text-xs text-ink-muted">{delivery.lastError}</p>}
                      </div>
                      <p className="text-xs font-medium text-ink-muted">Recovery action unavailable</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {paymentAttempts.length > 0 && (
              <section aria-labelledby="needs-recovery-payments">
                <h2 id="needs-recovery-payments" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Payments
                </h2>
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
                  {paymentAttempts.map((attempt) => (
                    <li key={attempt.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-danger">Payment attempt failed · {formatDateTime(attempt.completedAt ?? attempt.startedAt)}</p>
                        <p className="mt-1 text-sm font-medium text-ink">{attempt.organizationName}</p>
                        <p className="mt-0.5 text-sm text-ink-muted">
                          {attempt.programName} · Report #{attempt.reportId.slice(0, 8)}
                        </p>
                        {attempt.failureMessage && <p className="mt-1 text-xs text-ink-muted">{attempt.failureMessage}</p>}
                      </div>
                      <p className="text-xs font-medium text-ink-muted">Recovery action unavailable</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
