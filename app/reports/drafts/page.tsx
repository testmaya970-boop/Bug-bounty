import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { EmptyState } from "../../../components/ui/feedback";
import { LocalTime } from "../../../components/ui/local-time";
import { DeleteDraftButton } from "../../../components/reports/delete-draft-button";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { getSettingsAudience } from "../../../lib/auth/account-type";
import { listMyReportDrafts } from "../../../services/reports";

/**
 * My Drafts: every report the researcher started and hasn't submitted, across programs. The one
 * route that owns this list (Home only links here). Drafts are private to their owner (RLS);
 * nothing here has been sent to any program.
 */
export default async function MyDraftsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/reports/drafts" as Route);
  if ((await getSettingsAudience()) !== "researcher") redirect("/reports" as Route);

  const drafts = await listMyReportDrafts();

  return (
    <AppShell title="My drafts" user={user}>
      <div className="max-w-3xl space-y-6">
        <p className="text-sm text-ink-muted">
          Reports you started but haven&apos;t submitted. Only you can see them; a program sees a report only once you submit it.{" "}
          <Link prefetch={false} href={"/reports" as Route} className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            Submitted reports
          </Link>
        </p>

        {drafts.length === 0 ? (
          <EmptyState title="No drafts">Start a report from any program you research for. It saves as a draft while you write, so you can come back to it here.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {drafts.map((draft) => {
              const href = draft.organizationId ? (`/organizations/${draft.organizationId}/programs/${draft.programId}/reports/new?draft=${draft.id}` as Route) : null;
              return (
                <li key={draft.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    {href ? (
                      <Link prefetch={false} href={href} className="font-medium text-ink hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                        {draft.title}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{draft.title}</span>
                    )}
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {draft.programName ?? "A program you no longer have access to"} · saved <LocalTime value={draft.updatedAt} />
                      {draft.fileCount > 0 && ` · ${draft.fileCount} ${draft.fileCount === 1 ? "file" : "files"}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {href && (
                      <Link
                        prefetch={false}
                        href={href}
                        className="inline-flex min-h-10 items-center rounded-md border border-border-strong px-3.5 text-sm font-semibold text-ink transition-[transform,background-color] duration-150 hover:bg-surface-hover active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
                      >
                        Continue
                      </Link>
                    )}
                    <DeleteDraftButton draftId={draft.id} title={draft.title} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
