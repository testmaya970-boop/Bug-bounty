import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { AssetTypeBadge } from "../../../components/ui/badge";
import { ScopeReviewForm } from "../../../components/platform/scope-review-form";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { listScopeEntriesPendingReview } from "../../../services/scope";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { LocalTime } from "../../../components/ui/local-time";

/** IP ranges, apps, repositories, hardware and models an organization put in scope. DNS cannot
 * prove who owns these, so none authorizes testing until platform staff approve it
 * (202610260008). A non-admin gets a 404, like every platform page. */
export default async function PlatformScopeReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/scope-review" as Route);
  if (!(await isPlatformAdmin())) notFound();

  const items = await listScopeEntriesPendingReview();

  return (
    <AppShell title="Scope ownership review" user={user}>
      <div className="max-w-5xl space-y-6">
        <SectionLabel>Platform operations</SectionLabel>
        <p className="text-sm text-ink-muted">Confirm the organization owns each asset before researchers are sent to test it. Check app store publisher, repository owner, IP allocation (WHOIS/RIR) or contract.</p>
        {items.length === 0 ? (
          <EmptyState title="Nothing waiting">Every non-domain asset in scope has a decision.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {items.map((item) => (
              <li key={item.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <AssetTypeBadge assetType={item.assetType} />
                  <span className="min-w-0 break-all font-mono text-sm font-medium text-ink">{item.displayTarget}</span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {item.organizationName} / {item.programName} · Added <LocalTime value={item.createdAt} />
                </p>
                {item.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{item.description}</p>}
                <ScopeReviewForm entryId={item.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
