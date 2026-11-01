import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { EmptyState } from "../../../components/ui/feedback";
import { LocalTime } from "../../../components/ui/local-time";
import { ActionButton } from "../../../components/researcher/journey-controls";
import { requireResearcherSettings } from "../../../lib/auth/account-type";
import { listMyFollowedPrograms } from "../../../services/researcher-journey";
import { setProgramFollowAction } from "../../../actions/researcher-journey";

/** Programs you follow (202610280001): when each last published a policy or changed scope, so
 * you can see what moved since you last looked. Follow from any program page. */
export default async function SubscriptionsSettingsPage() {
  await requireResearcherSettings();
  const programs = await listMyFollowedPrograms();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="mt-1 text-sm text-ink-muted">Programs you follow, and when their policy or scope last changed.</p>
      </div>
      {programs.length === 0 ? (
        <EmptyState title="Not following any programs">
          Open a program and choose Follow to keep track of its policy and scope changes here.{" "}
          <Link prefetch={false} href={"/programs" as Route} className="font-medium text-action underline underline-offset-2">
            Browse programs
          </Link>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {programs.map((p) => {
            const changedAfterFollow = [p.policyPublishedAt, p.scopeChangedAt].some((d) => d && d > p.followedAt);
            return (
              <li key={p.programId} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <Link prefetch={false} href={`/organizations/${p.organizationId}/programs/${p.programId}` as Route} className="font-medium text-ink hover:text-action">
                    {p.programName}
                  </Link>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {p.organizationName} · {p.programType === "vdp" ? "Disclosure program" : "Bug bounty"}
                    {p.programStatus === "paused" && " · paused"}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Policy {p.policyPublishedAt ? <LocalTime value={p.policyPublishedAt} dateOnly /> : "not published"} · scope {p.scopeChangedAt ? <LocalTime value={p.scopeChangedAt} dateOnly /> : "none yet"}
                    {changedAfterFollow && <span className="ml-2 font-semibold text-action">Changed since you followed</span>}
                  </p>
                </div>
                <ActionButton variant="quiet" action={setProgramFollowAction.bind(null, p.programId, false)}>
                  Unfollow
                </ActionButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
