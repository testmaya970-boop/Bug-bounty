import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { isPlatformAdmin, listAuditLogsForAdmin } from "../../../services/platform-operations";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { LocalTime } from "../../../components/ui/local-time";

/**
 * A read path over public.audit_logs (existing since 202608250001, already written to by
 * every org/program/report/platform-admin RPC in this schema) -- not a new logging system,
 * just the first page that shows it. Non-admins get a real 404, same as every other
 * /platform page. See db/migrations/202610010001_delete_researcher_and_audit_log_viewer.sql.
 */
export default async function PlatformAuditLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/audit-log" as Route);
  if (!(await isPlatformAdmin())) notFound();

  const entries = await listAuditLogsForAdmin({ limit: 100 });

  return (
    <AppShell title="Audit log" user={user}>
      <div className="max-w-5xl space-y-6">
        <SectionLabel>Platform operations</SectionLabel>
        <p className="text-sm text-ink-muted">Every admin, organization, program, and report action recorded platform-wide. Most recent 100 entries.</p>

        {entries.length === 0 ? (
          <EmptyState title="No activity recorded">Nothing has been logged yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {entries.map((entry) => (
              <li key={entry.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                      {entry.action} · {entry.entityType}
                    </p>
                    <p className="mt-1 text-sm text-ink">
                      {entry.actorDisplayName ?? (entry.actorId ? "Deleted user" : "System")}
                      {entry.organizationName && <> · {entry.organizationName}</>}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-xs text-ink-muted">
                    <LocalTime value={entry.createdAt} />
                  </p>
                </div>
                {Object.keys(entry.metadata).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-action">Details</summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-surface-muted p-3 font-mono text-xs text-ink-muted">{JSON.stringify(entry.metadata, null, 2)}</pre>
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
