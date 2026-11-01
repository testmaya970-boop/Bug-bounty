import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { LocalTime } from "../../../components/ui/local-time";
import { SwagItemForm, SwagStaffUpdateForm } from "../../../components/researcher/journey-forms";
import { JourneyStatus } from "../../../components/researcher/journey-status";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { listSwag, listSwagRequestsForStaff } from "../../../services/researcher-journey";
import { getCurrentUser } from "../../../lib/auth/current-user";

/** The swag catalog and its requests (202610280001). Stock is what you enter; approving a request
 * takes one from stock, rejecting an approved one puts it back. Shipping is done by hand. */
export default async function PlatformSwagPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/swag" as Route);
  if (!(await isPlatformAdmin())) notFound();
  const [{ items }, requests] = await Promise.all([listSwag(), listSwagRequestsForStaff()]);

  return (
    <AppShell title="Swag" user={user}>
      <div className="max-w-5xl space-y-8">
        <section className="space-y-3">
          <SectionLabel>Requests</SectionLabel>
          {requests.length === 0 ? (
            <EmptyState title="No requests">Researcher requests appear here.</EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {requests.map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{r.itemName}</span>
                    <JourneyStatus status={r.status} />
                    <span className="text-xs text-ink-muted">
                      @{r.username} · <LocalTime value={r.createdAt} dateOnly />
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{`${r.shippingName}\n${r.shippingAddress}`}</p>
                  {(r.trackingReference || r.staffNote) && <p className="mt-1 text-xs text-ink-muted">{[r.trackingReference && `Tracking ${r.trackingReference}`, r.staffNote].filter(Boolean).join(" · ")}</p>}
                  {(r.status === "requested" || r.status === "approved") && <SwagStaffUpdateForm requestId={r.id} status={r.status} />}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-3 border-t border-border pt-6">
          <SectionLabel>Catalog</SectionLabel>
          {items.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
                  <span className="font-medium text-ink">
                    {i.name}
                    {!i.active && <span className="font-normal text-ink-muted"> · hidden</span>}
                  </span>
                  <span className="font-mono text-xs text-ink-muted">
                    {i.stock} in stock · reputation {i.minReputation}+
                  </span>
                </li>
              ))}
            </ul>
          )}
          <SwagItemForm />
        </section>
      </div>
    </AppShell>
  );
}
