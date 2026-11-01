"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "../ui/form";
import { assignReportAction } from "../../actions/reports";

/** Who is working this report. Any triage-team member can (re)assign it; the server
 * re-checks both the caller and the assignee (assign_report, 202610060011). */
export function ReportAssigneeControl({
  organizationId,
  programId,
  reportId,
  assigneeId,
  staff,
  currentUserId,
}: {
  organizationId: string;
  programId: string;
  reportId: string;
  assigneeId: string | null;
  staff: { userId: string; displayName: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function assign(next: string) {
    setError(null);
    startTransition(async () => {
      const result = await assignReportAction({ organizationId, programId, reportId, assigneeId: next === "" ? null : next });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Select label="Assignee" value={assigneeId ?? ""} disabled={pending} onChange={(event) => assign(event.target.value)}>
        <option value="">Unassigned</option>
        {staff.map((person) => (
          <option key={person.userId} value={person.userId}>
            {person.displayName}
            {person.userId === currentUserId ? " (you)" : ""}
          </option>
        ))}
      </Select>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
