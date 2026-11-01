"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { RegistryList, SectionLabel } from "../ui/security-primitives";
import { Button } from "../ui/button";
import { ErrorState } from "../ui/feedback";
import { SeverityBadge } from "../ui/badge";
import { reputationFactTypeEventLabel } from "../../lib/reputation-labels";
import { listReputationLedgerPageAction } from "../../actions/reputation";
import type { ReputationLedgerEntry } from "../../types/reputation";
import { LocalTime } from "../ui/local-time";

/** Report title/program name for one ledger row -- joined on client-side from the
 * researcher's own `listMyReports()`, since `reputation_ledger` carries no denormalized
 * copy of either (see services/reputation.ts's getMyReputationLedger). Absent (a report
 * outside the joined page) degrades to a bare "Report" label rather than erroring --
 * the report link itself still resolves correctly either way. */
export type ReputationEvidence = { title: string; programName: string };

function LedgerRow({ entry, evidence }: { entry: ReputationLedgerEntry; evidence: ReputationEvidence | undefined }) {
  // CTF solves have no report (or org/program): they link to the CTF section instead of a
  // /organizations/null/... 404 (found by the UI sweep).
  const reportHref = (entry.reportId ? `/organizations/${entry.organizationId}/programs/${entry.programId}/reports/${entry.reportId}` : "/ctf") as Route;
  const showSeverity = entry.confirmedSeverity && entry.confirmedSeverity !== "none";

  return (
    <li className="flex items-start justify-between gap-4 p-4 motion-safe:animate-enter-rise">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink-muted">{reputationFactTypeEventLabel(entry.factType)}</p>
        <Link prefetch={false}
          href={reportHref}
          className="mt-0.5 block truncate text-sm font-semibold text-ink hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {evidence?.title ?? (entry.reportId ? "Report" : "CTF practice")}
        </Link>
        <p className="mt-0.5 font-mono text-xs text-ink-muted">
          {evidence?.programName && <>{evidence.programName} · </>}
          <LocalTime value={entry.occurredAt} dateOnly />
        </p>
      </div>
      {showSeverity && <SeverityBadge severity={entry.confirmedSeverity!} />}
    </li>
  );
}

/** The researcher's own reputation history -- every entry is real evidence (an
 * organization-confirmed outcome), not a decorative activity feed. First page server-
 * rendered directly; "Load more" fetches the next page via a Server Action, the same
 * `Page<T>` cursor pattern every other list in this product uses (never infinite
 * scroll). The empty case is handled by the caller (app/researchers/page.tsx), since an
 * empty ledger and an empty summary are one product moment. */
export function ReputationLedgerSection({
  initialEntries,
  initialNextCursor,
  evidenceByReportId,
}: {
  initialEntries: ReputationLedgerEntry[];
  initialNextCursor: string | null;
  evidenceByReportId: Record<string, ReputationEvidence>;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadError(null);
    startTransition(async () => {
      const result = await listReputationLedgerPageAction({ cursor: nextCursor });
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setEntries((current) => [...current, ...result.data.items]);
      setNextCursor(result.data.nextCursor);
    });
  }

  return (
    <div>
      <SectionLabel>Reputation ledger</SectionLabel>
      <RegistryList className="mt-2">
        {entries.map((entry) => (
          <LedgerRow key={entry.id} entry={entry} evidence={entry.reportId ? evidenceByReportId[entry.reportId] : undefined} />
        ))}
      </RegistryList>

      {loadError && <ErrorState>{loadError}</ErrorState>}

      {nextCursor ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" pending={pending} onClick={handleLoadMore}>
            Load more
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-ink-muted">End of results.</p>
      )}
    </div>
  );
}
