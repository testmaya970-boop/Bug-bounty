"use client";

import React, { useState, useTransition } from "react";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Select } from "../ui/form";
import { RoleBadge } from "../ui/badge";
import { ORGANIZATION_ROLES, describeRoleChangeImpact, organizationRoleLabel } from "../../services/authorization";
import { changeOrganizationMemberRole } from "../../actions/organization-members";
import type { OrganizationRole } from "../../types/auth";

export function RoleChangeDialog({ organizationId, targetUserId, targetName, currentRole }: { organizationId: string; targetUserId: string; targetName: string; currentRole: OrganizationRole }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [newRole, setNewRole] = useState<OrganizationRole>(currentRole);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setStep("select");
    setNewRole(currentRole);
    setError(null);
  }

  function handleConfirmSelection() {
    if (newRole === currentRole) {
      setError("Choose a different role to continue.");
      return;
    }
    setError(null);
    setStep("confirm");
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await changeOrganizationMemberRole({ organizationId, targetUserId, newRole });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Change role
      </Button>
      <Dialog open={open} title="Change role" onClose={close}>
        {step === "select" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              Current role for {targetName}: <RoleBadge role={currentRole} />
            </p>
            <Select label="New role" value={newRole} onChange={(event) => setNewRole(event.target.value as OrganizationRole)} error={error ?? undefined}>
              {ORGANIZATION_ROLES.map((role) => (
                <option key={role} value={role}>
                  {organizationRoleLabel(role)}
                </option>
              ))}
            </Select>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="button" onClick={handleConfirmSelection}>
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-ink-muted">Current role</dt>
                <dd className="mt-0.5">
                  <RoleBadge role={currentRole} />
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">New role</dt>
                <dd className="mt-0.5">
                  <RoleBadge role={newRole} />
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Access impact</dt>
                <dd className="mt-0.5">{describeRoleChangeImpact(currentRole, newRole)}</dd>
              </div>
            </dl>
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button type="button" variant="destructive" pending={pending} onClick={handleConfirm}>
                Confirm role change
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
