import React from "react";
import { DataTable, type DataColumn } from "../ui/data-display";
import { Avatar } from "../ui/navigation";
import { ResearcherStatusBadge } from "../ui/badge";
import { ReinstateResearcherDialog, RevokeResearcherDialog, SuspendResearcherDialog } from "./researcher-action-dialogs";
import { formatDate } from "../../lib/format-date";
import type { ProgramResearcherRecord } from "../../types/researcher";

type Row = ProgramResearcherRecord & { id: string };

export function ResearcherTable({ organizationId, programId, researchers }: { organizationId: string; programId: string; researchers: ProgramResearcherRecord[] }) {
  const columns: DataColumn<Row>[] = [
    {
      id: "researcher",
      header: "Researcher",
      cell: (row) => (
        <span className="flex items-center gap-3">
          <Avatar name={row.displayName} />
          <span>
            <span className="block font-medium text-ink">{row.displayName}</span>
            <span className="block text-xs text-ink-muted">{row.email ?? `@${row.username}`}</span>
          </span>
        </span>
      ),
    },
    { id: "status", header: "Status", cell: (row) => <ResearcherStatusBadge status={row.status} /> },
    { id: "joined", header: "Joined", cell: (row) => <span className="text-sm text-ink-muted">{formatDate(row.joinedAt)}</span> },
    {
      id: "actions",
      header: "Actions",
      cell: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "active" && <SuspendResearcherDialog organizationId={organizationId} programId={programId} targetUserId={row.userId} />}
          {row.status === "suspended" && <ReinstateResearcherDialog organizationId={organizationId} programId={programId} targetUserId={row.userId} />}
          {row.status !== "revoked" && <RevokeResearcherDialog organizationId={organizationId} programId={programId} targetUserId={row.userId} />}
        </div>
      ),
    },
  ];

  return <DataTable columns={columns} rows={researchers.map((researcher): Row => ({ ...researcher, id: researcher.userId }))} />;
}
