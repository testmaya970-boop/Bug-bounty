import React from "react";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { isPlatformAdmin, listAppErrorGroupsForAdmin } from "../../../services/platform-operations";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { cn } from "../../../lib/cn";
import { LocalTime } from "../../../components/ui/local-time";

const WINDOWS = [1, 7, 30] as const;

/**
 * In-house error tracking (db/migrations/202609250008_app_errors.sql): server errors
 * (instrumentation.ts, unmapped database errors) and browser errors (error boundaries +
 * window listeners), grouped by fingerprint. Non-admins get a 404 like every /platform page.
 */
export default async function PlatformErrorsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/errors" as Route);
  if (!(await isPlatformAdmin())) notFound();

  const requested = Number((await searchParams).days);
  const days = (WINDOWS as readonly number[]).includes(requested) ? requested : 7;
  const groups = await listAppErrorGroupsForAdmin(days);
  const total = groups.reduce((sum, g) => sum + g.occurrences, 0);

  return (
    <AppShell title="Errors" user={user}>
      <div className="max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionLabel>Platform operations</SectionLabel>
            <p className="mt-1 text-sm text-ink-muted">
              {total.toLocaleString("en-US")} error{total === 1 ? "" : "s"} in {groups.length} group{groups.length === 1 ? "" : "s"}, last {days} day{days === 1 ? "" : "s"}. Identical bugs are grouped even when ids or values differ.
            </p>
          </div>
          <nav aria-label="Time window" className="flex gap-1">
            {WINDOWS.map((w) => (
              <Link
                key={w}
                prefetch={false}
                href={`/platform/errors?days=${w}` as Route}
                aria-current={w === days ? "true" : undefined}
                className={cn("rounded-md border px-3 py-1.5 text-sm font-medium", w === days ? "border-action text-ink" : "border-border text-ink-muted hover:text-ink")}
              >
                {w === 1 ? "24h" : `${w}d`}
              </Link>
            ))}
          </nav>
        </div>

        {groups.length === 0 ? (
          <EmptyState title="No errors recorded">Nothing has failed in this window.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {groups.map((g) => (
              <li key={g.fingerprint} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-mono text-[11px] font-semibold text-ink-muted">
                      <span className={g.source === "server" ? "text-danger" : "text-warning"}>{g.source}</span>
                      {g.route && <> · {g.route}</>}
                    </p>
                    <p className="mt-1 break-words text-sm font-medium text-ink">{g.message}</p>
                  </div>
                  <div className="text-right font-mono text-xs text-ink-muted">
                    <p>
                      <span className="text-base font-semibold tabular-nums text-ink">{g.occurrences.toLocaleString("en-US")}</span>×
                      {g.affectedUsers > 0 && <> · {g.affectedUsers} user{g.affectedUsers === 1 ? "" : "s"}</>}
                    </p>
                    <p>last <LocalTime value={g.lastSeen} /></p>
                    <p>first <LocalTime value={g.firstSeen} /></p>
                  </div>
                </div>
                {g.stack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-action">Latest stack trace</summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-surface-muted p-3 font-mono text-xs text-ink-muted">{g.stack}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
