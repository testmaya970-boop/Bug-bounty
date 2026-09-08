import React from "react";
import { describeOrganizationAccess } from "../../services/authorization";
import type { OrganizationRole } from "../../types/auth";
import { Badge } from "../ui/badge";

/**
 * Sentinel's "role is not the same as access" differentiator: every place a role is
 * shown, this renders what it actually grants and denies, computed from the same
 * capability model the server enforces (services/authorization.ts) -- never
 * hand-written per-screen copy that could drift from what the database allows.
 */
export function AccessSummary({ role }: { role: OrganizationRole }) {
  const summary = describeOrganizationAccess(role);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-ink-muted">Organization access</span>
        <Badge className={summary.organizationAccess === "Full" ? "text-success" : "text-ink-muted"}>{summary.organizationAccess}</Badge>
      </div>
      <ProgramAccessNote />
      {summary.can.length > 0 && (
        <ul className="space-y-1 text-sm">
          {summary.can.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5 text-success">
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {summary.cannot.length > 0 && (
        <ul className="space-y-1 text-sm text-ink-muted">
          {summary.cannot.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5">
                ×
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {summary.note && <p className="text-xs text-ink-muted">{summary.note}</p>}
    </div>
  );
}

/**
 * This summary describes organization-level capability only. Which specific programs a
 * member can manage is a separate, per-program assignment (program_members) shown on
 * each program's own page, never fabricated here as a cross-program count or list.
 */
export function ProgramAccessNote() {
  return <p className="text-sm text-ink-muted">Program-level access is assigned separately, within each program.</p>;
}
