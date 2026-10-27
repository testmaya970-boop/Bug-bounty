import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { ToneBadge, TONE } from "../../../components/ui/badge";
import { MarkContactHandledButton } from "../../../components/platform/mark-contact-handled-button";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { CONTACT_TOPICS, listContactRequests } from "../../../services/contact-requests";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { LocalTime } from "../../../components/ui/local-time";

/** Messages from the public /contact page, newest open ones first. A non-admin gets a 404. */
export default async function PlatformContactRequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/contact-requests" as Route);
  if (!(await isPlatformAdmin())) notFound();

  const requests = await listContactRequests();
  const open = requests.filter((r) => r.status === "new").length;

  return (
    <AppShell title="Contact requests" user={user}>
      <div className="max-w-5xl space-y-6">
        <SectionLabel>Platform operations</SectionLabel>
        <p className="text-sm text-ink-muted">{open} open · reply from your own mailbox, then mark handled.</p>
        {requests.length === 0 ? (
          <EmptyState title="No messages yet">Messages sent from the public contact page appear here.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {requests.map((r) => (
              <li key={r.id} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ToneBadge tone={r.status === "new" ? TONE.info : TONE.muted}>{r.status === "new" ? "Open" : "Handled"}</ToneBadge>
                    <span className="text-xs text-ink-muted">
                      {CONTACT_TOPICS[r.topic]} · <LocalTime value={r.createdAt} />
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink">
                    {r.name}, {r.company}
                  </p>
                  <p className="mt-0.5 break-all text-sm text-ink-muted">
                    <a href={`mailto:${r.email}`} className="text-action underline underline-offset-2">
                      {r.email}
                    </a>
                    {r.website && <> · {r.website}</>}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{r.message}</p>
                </div>
                {r.status === "new" && <MarkContactHandledButton id={r.id} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
