import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { LocalTime } from "../../../components/ui/local-time";
import { ActionButton } from "../../../components/researcher/journey-controls";
import { requireResearcherSettings } from "../../../lib/auth/account-type";
import { listMyAgreements } from "../../../services/researcher-journey";
import { acceptAgreementAction } from "../../../actions/researcher-journey";

/** What you have agreed to, and which version (202610280001). Platform agreements are recorded as
 * an acknowledgement (account, version, time), not a verified electronic signature. Program
 * policies are the versions you accepted when you submitted reports. */
export default async function DigitalAgreementsPage() {
  await requireResearcherSettings();
  const agreements = await listMyAgreements();
  const platform = agreements.filter((a) => a.kind === "platform");
  const policies = agreements.filter((a) => a.kind === "program_policy");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Digital agreements</h1>
        <p className="mt-1 text-sm text-ink-muted">Each acceptance is recorded against your account with the exact text and time. It is an acknowledgement, not a verified electronic signature.</p>
      </div>

      <section className="space-y-3">
        <SectionLabel>Unpatched agreements</SectionLabel>
        {platform.map((a) => (
          <article key={a.agreementId} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-ink">
                {a.title}
              </h2>
              <span className="text-xs text-ink-muted">
                Published <LocalTime value={a.publishedAt} dateOnly />
              </span>
            </div>
            <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-muted p-3 text-sm leading-relaxed text-ink">{a.body}</div>
            {a.sourcePath && (
              <p className="mt-2 text-xs text-ink-muted">
                Also published at{" "}
                <Link prefetch={false} href={a.sourcePath as Route} className="text-action underline underline-offset-2">
                  {a.sourcePath}
                </Link>
                .
              </p>
            )}
            <div className="mt-3">
              {a.acceptedAt ? (
                <p className="text-sm font-medium text-success">
                  You accepted this text on <LocalTime value={a.acceptedAt} />.
                </p>
              ) : (
                <ActionButton variant="primary" action={acceptAgreementAction.bind(null, a.agreementId)}>
                  I have read and accept this
                </ActionButton>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <SectionLabel>Program policies you accepted</SectionLabel>
        {policies.length === 0 ? (
          <p className="text-sm text-ink-muted">None yet. A program&apos;s policy is accepted when you submit your first report to it.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {policies.map((a) => (
              <li key={a.agreementId} className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm">
                <Link prefetch={false} href={`/organizations/${a.organizationId}/programs/${a.programId}` as Route} className="min-w-0 font-medium text-ink hover:text-action">
                  {a.title}
                </Link>
                <span className="text-ink-muted">{a.acceptedAt ? <>accepted <LocalTime value={a.acceptedAt} dateOnly /></> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
