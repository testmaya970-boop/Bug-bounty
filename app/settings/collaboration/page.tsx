import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { EmptyState } from "../../../components/ui/feedback";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { LocalTime } from "../../../components/ui/local-time";
import { ActionButton } from "../../../components/researcher/journey-controls";
import { JourneyStatus } from "../../../components/researcher/journey-status";
import { requireResearcherSettings } from "../../../lib/auth/account-type";
import { listMyCollaborations, type Collaboration } from "../../../services/researcher-journey";
import { respondCollaborationAction, revokeCollaborationAction } from "../../../actions/researcher-journey";

/** Every report you share, from both sides. Collaboration is per report (decision 0064): the
 * submitter invites from the report page, the invitee accepts here, and only accepted shares are
 * paid (one payment per person, the submitter keeps the remainder). Shares lock once a report
 * leaves triage, so a payout is never changed after the fact. */
export default async function CollaborationSettingsPage() {
  await requireResearcherSettings();
  const rows = await listMyCollaborations();
  const incoming = rows.filter((r) => r.kind === "invitation" && r.myRole === "invitee" && r.status === "pending" && r.editable);
  const rest = rows.filter((r) => !incoming.includes(r));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Collaboration</h1>
        <p className="mt-1 text-sm text-ink-muted">Reports you share with other researchers, and invitations to join theirs.</p>
      </div>

      <section className="space-y-3">
        <SectionLabel>Invitations for you</SectionLabel>
        {incoming.length === 0 ? (
          <p className="text-sm text-ink-muted">No invitations waiting.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {incoming.map((r) => (
              <li key={r.id} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{r.reportTitle}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {r.programName} · from {r.otherDisplayName}
                    {r.otherUsername && ` (@${r.otherUsername})`} · your share <span className="font-mono text-ink">{r.splitPercent}%</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">Accepting lets you read and comment on the report. Your share is paid separately when the bounty is awarded.</p>
                </div>
                <div className="flex gap-2">
                  <ActionButton variant="primary" action={respondCollaborationAction.bind(null, r.id, true)}>
                    Accept
                  </ActionButton>
                  <ActionButton action={respondCollaborationAction.bind(null, r.id, false)}>Decline</ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel>All collaborations</SectionLabel>
        {rest.length === 0 ? (
          <EmptyState title="No shared reports yet">
            To work with someone on a finding, open your report while it is new or in triage and invite them from its Collaborators panel.{" "}
            <Link prefetch={false} href={"/reports" as Route} className="font-medium text-action underline underline-offset-2">
              Your reports
            </Link>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rest.map((r) => (
              <CollaborationRow key={`${r.kind}-${r.id}`} row={r} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 border-t border-border pt-6 text-sm text-ink-muted">
        <SectionLabel>How shares work</SectionLabel>
        <ul className="list-inside list-disc space-y-1">
          <li>The submitter invites a researcher who is active on the same program and proposes their share.</li>
          <li>Pending invitations reserve their share, so shares can never add up to 100% or more. The submitter always keeps a share.</li>
          <li>Invitations can be accepted, declined or revoked only while the report is new or in triage. After that, every share is final.</li>
          <li>When a bounty is awarded, each accepted collaborator is paid their share, rounded down to the smallest currency unit. The submitter receives the remainder.</li>
        </ul>
      </section>
    </div>
  );
}

function CollaborationRow({ row: r }: { row: Collaboration }) {
  const role = r.myRole === "submitter" ? `You submitted · ${r.otherDisplayName}${r.otherUsername ? ` (@${r.otherUsername})` : ""} has ${r.splitPercent}%` : `${r.otherDisplayName}'s report · your share ${r.splitPercent}%`;
  return (
    <li className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {r.reportHref ? (
            <Link prefetch={false} href={r.reportHref as Route} className="break-words text-sm font-medium text-ink hover:text-action">
              {r.reportTitle}
            </Link>
          ) : (
            <span className="break-words text-sm font-medium text-ink">{r.reportTitle}</span>
          )}
          <JourneyStatus status={r.kind === "collaborator" ? "accepted" : r.status} />
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">
          {r.programName} · {role} · <LocalTime value={r.createdAt} dateOnly />
        </p>
      </div>
      {r.kind === "invitation" && r.myRole === "submitter" && r.editable && (
        <ActionButton variant="quiet" action={revokeCollaborationAction.bind(null, r.id)} confirm="They will no longer be able to accept it, and its share is released." confirmLabel="Revoke invitation?">
          Revoke
        </ActionButton>
      )}
    </li>
  );
}
