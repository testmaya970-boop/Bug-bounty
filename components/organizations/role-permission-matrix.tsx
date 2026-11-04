import React from "react";
import { Check, Minus } from "lucide-react";
import type { OrganizationRole } from "../../types/auth";
import {
  ORGANIZATION_ROLES,
  canChangeRoles,
  canCreateProgram,
  canManageIntegrations,
  canManageMembers,
  canManagePayments,
  canViewOrganizationAnalytics,
  canViewOrganizationResearchers,
  organizationRoleLabel,
} from "../../services/authorization";

// Built from the same checks the server enforces, so the matrix can't drift from reality.
const CAPABILITIES: { label: string; allowed: (role: OrganizationRole) => boolean }[] = [
  { label: "Invite and suspend members", allowed: canManageMembers },
  { label: "Change member roles", allowed: canChangeRoles },
  { label: "Create engagements", allowed: canCreateProgram },
  { label: "Connect integrations", allowed: canManageIntegrations },
  { label: "Add funds and pay bounties", allowed: canManagePayments },
  { label: "View organization analytics", allowed: canViewOrganizationAnalytics },
  { label: "View researcher intelligence", allowed: canViewOrganizationResearchers },
];

export function RolePermissionMatrix() {
  return (
    <section aria-labelledby="role-matrix-heading" className="rounded-2xl border border-border bg-surface p-5">
      <h2 id="role-matrix-heading" className="text-base font-semibold text-ink">Roles and permissions</h2>
      <p className="mt-1 text-sm text-ink-muted">What each organization role can do. Program work (triage, bounties) is assigned per engagement.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[12px] text-ink-muted">
              <th scope="col" className="py-2 pr-3 font-medium">Permission</th>
              {ORGANIZATION_ROLES.map((role) => (
                <th key={role} scope="col" className="px-2 py-2 text-center font-medium">{organizationRoleLabel(role)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((cap) => (
              <tr key={cap.label} className="border-b border-border last:border-0">
                <th scope="row" className="py-2.5 pr-3 font-medium text-ink">{cap.label}</th>
                {ORGANIZATION_ROLES.map((role) => (
                  <td key={role} className="px-2 py-2.5 text-center">
                    {cap.allowed(role) ? (
                      <Check className="mx-auto size-4 text-[#027A48]" role="img" aria-label="Allowed" />
                    ) : (
                      <Minus className="mx-auto size-4 text-ink-muted/60" role="img" aria-label="Not allowed" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
