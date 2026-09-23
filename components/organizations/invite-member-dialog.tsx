"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Input, Select, Textarea } from "../ui/form";
import { RoleBadge } from "../ui/badge";
import { organizationRoleLabel } from "../../services/authorization";
import { inviteOrganizationMember } from "../../actions/organization-members";
import { formatDateTime } from "../../lib/format-date";
import type { OrganizationRole } from "../../types/auth";

// Matches the server default (expires_in_hours = 168) in the invite_organization_member
// function. If that default ever changes, change it here too.
const INVITATION_EXPIRY_DAYS = 7;

export function InviteMemberDialog({ organizationId, invitableRoles }: { organizationId: string; invitableRoles: OrganizationRole[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>(invitableRoles[0] ?? "triager");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setStep("form");
    setEmail("");
    setMessage("");
    setError(null);
  }

  function handleContinue(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter an email address.");
      return;
    }
    setStep("confirm");
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const result = await inviteOrganizationMember({ organizationId, email, role, message: message.trim() || undefined });
      if (!result.ok) {
        setError(result.message);
        setStep("form");
        return;
      }
      close();
      router.refresh();
    });
  }

  const expires = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite member</Button>
      <Dialog open={open} title={step === "form" ? "Invite a member" : "Confirm invitation"} onClose={close}>
        {step === "form" ? (
          <form className="space-y-4" onSubmit={handleContinue}>
            <Input label="Email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} error={error ?? undefined} />
            <Select label="Role" value={role} onChange={(event) => setRole(event.target.value as OrganizationRole)}>
              {invitableRoles.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {organizationRoleLabel(candidate)}
                </option>
              ))}
            </Select>
            <Textarea label="Message" helperText="Optional. Included with the invitation." value={message} onChange={(event) => setMessage(event.target.value)} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">Continue</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-surface-muted p-4 text-sm">
              <p className="text-ink-muted">You&apos;re inviting</p>
              <p className="mt-1 font-semibold text-ink">{email}</p>
              <p className="mt-3 text-ink-muted">Role</p>
              <p className="mt-1">
                <RoleBadge role={role} />
              </p>
              <p className="mt-3 text-ink-muted">Initial access</p>
              <p className="mt-1">No program access until assigned.</p>
              <p className="mt-3 text-ink-muted">Invitation expires</p>
              <p className="mt-1">{formatDateTime(expires)}</p>
            </div>
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep("form")}>
                Back
              </Button>
              <Button type="button" pending={pending} onClick={handleSend}>
                Send invitation
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
