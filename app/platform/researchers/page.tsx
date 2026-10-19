import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { DeleteResearcherForm, ReactivateAccountForm, ReinstateResearcherForm, SuspendResearcherForm } from "../../../components/platform/researcher-suspension-form";
import { isPlatformAdmin, listRestrictedAccountsForAdmin } from "../../../services/platform-operations";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { LocalTime } from "../../../components/ui/local-time";

/**
 * A non-admin gets a real 404, not a "Permission denied" page -- same convention every
 * other platform-admin queue in this codebase already established. Cross-program,
 * platform-wide researcher suspension: see supabase/migrations/
 * 202609050014_researcher_platform_suspension.sql. A single platform admin can suspend or
 * reinstate a researcher -- that migration's own comment discloses this as a real,
 * disclosed limitation (no dual control yet), not a silent assumption of safety. Uses
 * <AppShell> like every other authenticated page -- see app/platform/programs/page.tsx's
 * own comment for why this replaced a separate header+nav-bar component.
 */
export default async function PlatformResearchersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 100);
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/researchers" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const restricted = await listRestrictedAccountsForAdmin(query);

  return (
    <AppShell title="Researcher suspension" user={user}>
      <div className="max-w-5xl space-y-6">
        <SectionLabel>Platform operations</SectionLabel>
        <p className="text-sm text-ink-muted">Suspend or reinstate a researcher's account platform-wide, across every organization and program.</p>

        <SuspendResearcherForm />
        <DeleteResearcherForm />

        <section className="space-y-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Suspended and deactivated accounts</h2>
            <p className="mt-1 text-sm text-ink-muted">Reinstate a suspended account, or reactivate one its owner deactivated and asked to bring back. Accounts deleted by a platform admin can&apos;t be restored and aren&apos;t listed.</p>
          </div>
          <form action="/platform/researchers" method="get" role="search" className="flex gap-2">
            <label htmlFor="restricted-q" className="sr-only">
              Search suspended and deactivated accounts
            </label>
            <input
              id="restricted-q"
              name="q"
              type="search"
              defaultValue={query}
              maxLength={100}
              placeholder="Search by name, username or email"
              className="min-h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
            />
            <button type="submit" className="min-h-11 shrink-0 rounded-md border border-border bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-hover">
              Search
            </button>
          </form>
          {restricted.length === 0 ? (
            <EmptyState title={query ? "No matching accounts" : "No restricted accounts"}>
              {query ? <>No suspended or deactivated account matches &ldquo;{query}&rdquo;.</> : "Every account is active."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {restricted.map((account) => (
                <li key={account.id} className="p-4">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${account.state === "suspended" ? "text-danger" : "text-warning"}`}>
                    {account.state === "suspended" ? "Suspended" : "Deactivated by its owner"}
                    {account.since && (
                      <>
                        {" · "}
                        <LocalTime value={account.since} />
                      </>
                    )}
                  </p>
                  <p className="mt-1 break-words text-sm font-medium text-ink">{account.displayName}</p>
                  <p className="mt-0.5 break-all text-sm text-ink-muted">
                    @{account.username}
                    {account.email && <> · {account.email}</>} · {account.accountType === "organization" ? "Organization account" : "Researcher account"}
                  </p>
                  {account.state === "suspended" ? <ReinstateResearcherForm userId={account.id} /> : account.email && <ReactivateAccountForm email={account.email} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
