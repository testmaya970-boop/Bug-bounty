import React from "react";
import { ActivityTimeline } from "../ui/data-display";
import { formatDateTime as formatTimestamp } from "../../lib/format-date";
import type { OrganizationAuditEventRecord } from "../../types/organization";

const ACTION_LABELS: Record<string, string> = {
  "member.invited": "invited a member",
  "member.invitation_accepted": "accepted an invitation",
  "member.invitation_cancelled": "cancelled an invitation",
  "member.role_changed": "changed a member's role",
  "member.suspended": "suspended a member",
  "member.reactivated": "reactivated a member",
  "member.removed": "removed a member",
};

function describeEvent(event: OrganizationAuditEventRecord, actorName: string): { title: string; detail: string } {
  const actionLabel = ACTION_LABELS[event.action] ?? event.action;
  const title = event.actorId ? `${actorName} ${actionLabel}` : `System event: ${actionLabel}`;

  if (event.action === "member.role_changed" && event.metadata.previous_role && event.metadata.new_role) {
    return { title, detail: `${event.metadata.previous_role} → ${event.metadata.new_role}` };
  }
  if ((event.action === "member.invited" || event.action === "member.invitation_cancelled") && typeof event.metadata.email === "string") {
    return { title, detail: event.metadata.email };
  }
  return { title, detail: "" };
}

/** Human actions (actorId set) and system events (actorId null) get distinct copy, per DESIGN.md's timeline rules. */
export function MemberActivity({ events, actorNames }: { events: OrganizationAuditEventRecord[]; actorNames: Record<string, string> }) {
  const items = events.map((event) => {
    const actorName = (event.actorId && actorNames[event.actorId]) || "A member";
    const { title, detail } = describeEvent(event, actorName);
    return { id: event.id, title, detail, timestamp: formatTimestamp(event.createdAt) };
  });
  return <ActivityTimeline items={items} />;
}
