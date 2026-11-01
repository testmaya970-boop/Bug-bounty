"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "../ui/form";
import { setReportPriorityAction } from "../../actions/reports";
import { PRIORITY_ORDER, priorityForSeverity, priorityLabel } from "../../lib/report-priority";
import { severityLabel } from "../../lib/report-status";
import type { ReportPriority, ReportSeverity } from "../../types/report";

/**
 * The triager's P0-P4 call. It defaults from the confirmed severity and only needs touching
 * when the program treats a finding differently from its technical severity; it picks the
 * payout tier the bounty recommendation uses. Editable after a final decision (that is when a
 * bounty is calculated), locked once the bounty is finalized (the database refuses too).
 * No optimistic update: the label only changes once the server has accepted it.
 */
export function PriorityControl({
  organizationId,
  programId,
  reportId,
  priority,
  confirmedSeverity,
  locked,
}: {
  organizationId: string;
  programId: string;
  reportId: string;
  priority: ReportPriority | null;
  confirmedSeverity: ReportSeverity | null;
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const defaultPriority = confirmedSeverity ? priorityForSeverity(confirmedSeverity) : null;

  function handleChange(value: string) {
    setError(null);
    startTransition(async () => {
      const result = await setReportPriorityAction({ organizationId, programId, reportId, priority: value === "" ? null : (value as ReportPriority) });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <Select
        label="Priority"
        value={priority ?? ""}
        disabled={locked || pending}
        onChange={(event) => handleChange(event.target.value)}
        aria-busy={pending || undefined}
        helperText={
          locked
            ? "Locked: this report's bounty is finalized."
            : "Sets the payout tier. Follows the confirmed severity unless you choose otherwise; it is not a CVSS rating."
        }
      >
        <option value="">{defaultPriority ? `Follow severity (${priorityLabel(defaultPriority)}, from ${severityLabel(confirmedSeverity!)})` : "Follow severity (confirm a severity first)"}</option>
        {PRIORITY_ORDER.map((p) => (
          <option key={p} value={p}>
            {priorityLabel(p)}
          </option>
        ))}
      </Select>
      {error && (
        <p role="alert" className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
