import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { DataTable, type DataColumn } from "../ui/data-display";
import { Avatar } from "../ui/navigation";
import { Badge, MemberStatusBadge, RoleBadge } from "../ui/badge";
import { describeOrganizationAccess } from "../../services/authorization";
import type { OrganizationMemberRecord } from "../../types/organization";
import { LocalTime } from "../ui/local-time";

type Row = OrganizationMemberRecord & { id: string };

export function MemberTable({ organizationId, members, lastActivityByUserId }: { organizationId: string; members: OrganizationMemberRecord[]; lastActivityByUserId: Record<string, string> }) {
  const columns: DataColumn<Row>[] = [
    {
      id: "member",
      header: "Member",
      cell: (row) => (
        <Link prefetch={false} href={`/organizations/${organizationId}/members/${row.userId}` as Route} className="flex items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <Avatar name={row.displayName} />
          <span>
            <span className="block font-medium text-ink">{row.displayName}</span>
            <span className="block text-xs text-ink-muted">{row.email ?? `@${row.username}`}</span>
          </span>
        </Link>
      ),
    },
    { id: "role", header: "Role", cell: (row) => <RoleBadge role={row.role} /> },
    {
      id: "access",
      header: "Access",
      cell: (row) => {
        const access = describeOrganizationAccess(row.role);
        return <Badge className={access.organizationAccess === "Full" ? "text-success" : "text-ink-muted"}>{access.organizationAccess} org access</Badge>;
      },
    },
    { id: "status", header: "Status", cell: (row) => <MemberStatusBadge status={row.status} /> },
    {
      id: "activity",
      header: "Last activity",
      cell: (row) => <span className="text-sm text-ink-muted">{lastActivityByUserId[row.userId] ? <LocalTime value={lastActivityByUserId[row.userId]} dateOnly /> : "No recorded activity"}</span>,
    },
    { id: "joined", header: "Joined", cell: (row) => <span className="text-sm text-ink-muted"><LocalTime value={row.joinedAt} dateOnly /></span> },
    {
      id: "actions",
      header: "Actions",
      cell: (row) => (
        <Link prefetch={false} href={`/organizations/${organizationId}/members/${row.userId}` as Route} className="text-sm font-semibold text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Manage
        </Link>
      ),
    },
  ];

  return <DataTable columns={columns} rows={members.map((member): Row => ({ ...member, id: member.userId }))} />;
}
