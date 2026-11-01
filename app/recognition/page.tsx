import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui/feedback";
import { SectionLabel } from "../../components/ui/security-primitives";
import { LocalTime } from "../../components/ui/local-time";
import { ActionButton } from "../../components/researcher/journey-controls";
import { CveRequestForm } from "../../components/researcher/journey-forms";
import { JourneyStatus } from "../../components/researcher/journey-status";
import { getCurrentUser } from "../../lib/auth/current-user";
import { getSettingsAudience } from "../../lib/auth/account-type";
import { listMyAcknowledgements, listMyCveEligibleReports, listMyCveRequests } from "../../services/researcher-journey";
import { respondAcknowledgementAction, revokeAcknowledgementAction, withdrawCveAction } from "../../actions/researcher-journey";

/** Recognition (202610280001): Hall of Fame credit organizations offered you (you decide whether
 * it goes public) and CVE requests for your disclosed findings. A CVE shows as assigned only once
 * Unpatched records the identifier a CVE Numbering Authority issued, with its public record. */
export default async function RecognitionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/recognition" as Route);
  if ((await getSettingsAudience()) !== "researcher") redirect("/" as Route);

  const [acks, eligible, cves] = await Promise.all([listMyAcknowledgements(), listMyCveEligibleReports(), listMyCveRequests()]);

  return (
    <AppShell title="Recognition" user={user}>
      <div className="max-w-4xl space-y-10">
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionLabel>Hall of Fame</SectionLabel>
            <Link prefetch={false} href={"/hall-of-fame" as Route} className="text-sm font-medium text-action hover:text-action-hover">
              Public Hall of Fame →
            </Link>
          </div>
          <p className="text-sm text-ink-muted">An organization can thank you publicly for a report. Your name appears only if you agree, and you can take it down at any time. The finding itself is never shown.</p>
          {acks.length === 0 ? (
            <EmptyState title="No acknowledgements yet">When an organization offers you credit for an accepted or resolved report, it appears here for you to accept or decline.</EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {acks.map((a) => (
                <li key={a.id} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{a.programName}</span>
                      <JourneyStatus status={a.status} />
                    </div>
                    <p className="mt-0.5 break-words text-sm text-ink-muted">
                      {a.organizationName} · for &ldquo;{a.reportTitle}&rdquo; · <LocalTime value={a.createdAt} dateOnly />
                    </p>
                    {a.note && <p className="mt-1 text-sm text-ink">&ldquo;{a.note}&rdquo;</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.status === "proposed" && (
                      <>
                        <ActionButton variant="primary" action={respondAcknowledgementAction.bind(null, a.id, true)}>
                          Show my name
                        </ActionButton>
                        <ActionButton action={respondAcknowledgementAction.bind(null, a.id, false)}>Decline</ActionButton>
                      </>
                    )}
                    {a.status === "published" && (
                      <ActionButton variant="quiet" action={revokeAcknowledgementAction.bind(null, a.id)} confirm="Your name comes off this program's Hall of Fame. The organization would have to offer credit again to restore it." confirmLabel="Remove from Hall of Fame?">
                        Remove
                      </ActionButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <SectionLabel>CVE requests</SectionLabel>
          <p className="text-sm text-ink-muted">
            A resolved report whose disclosure is public can be put forward for a CVE identifier. Unpatched reviews each request and, if approved, files it with a CVE Numbering Authority. That step happens outside this app, so an approved request is not a
            CVE until the identifier is recorded here.
          </p>
          {eligible.length > 0 && (
            <div className="space-y-4">
              {eligible.map((r) => (
                <details key={r.reportId} className="rounded-lg border border-border p-4">
                  <summary className="cursor-pointer text-sm font-medium text-ink">
                    Request a CVE for &ldquo;{r.publishedTitle ?? r.reportTitle}&rdquo; <span className="font-normal text-ink-muted">· {r.programName}</span>
                  </summary>
                  <div className="mt-3">
                    <CveRequestForm reportId={r.reportId} />
                  </div>
                </details>
              ))}
            </div>
          )}
          {cves.length === 0 && eligible.length === 0 ? (
            <EmptyState title="Nothing eligible yet">
              A report becomes eligible once it is resolved and its disclosure is published.{" "}
              <Link prefetch={false} href={"/disclosures" as Route} className="font-medium text-action underline underline-offset-2">
                Public disclosures
              </Link>
            </EmptyState>
          ) : (
            cves.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {cves.map((c) => (
                  <li key={c.id} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-words text-sm font-medium text-ink">{c.reportTitle}</span>
                        <JourneyStatus status={c.status} />
                        {c.cveId && c.cveEvidenceUrl && (
                          <a href={c.cveEvidenceUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-action underline underline-offset-2">
                            {c.cveId}
                          </a>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {c.affectedProduct} {c.affectedVersions} · requested <LocalTime value={c.createdAt} dateOnly />
                      </p>
                      {c.status === "approved" && <p className="mt-1 text-xs text-ink-muted">Approved by Unpatched. Waiting for a CVE Numbering Authority to issue the identifier.</p>}
                      {c.reviewerNote && <p className="mt-1 text-sm text-ink">Reviewer: {c.reviewerNote}</p>}
                    </div>
                    {c.status === "pending" && (
                      <ActionButton variant="quiet" action={withdrawCveAction.bind(null, c.id)}>
                        Withdraw
                      </ActionButton>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}
        </section>
      </div>
    </AppShell>
  );
}
