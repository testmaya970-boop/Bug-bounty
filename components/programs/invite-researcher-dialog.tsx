"use client";

import React, { useState, useTransition } from "react";
import { InvitationSentPanel } from "../organizations/invitation-sent-panel";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Input, Textarea } from "../ui/form";
import { inviteResearcherByUsernameToProgram, inviteResearcherToProgram } from "../../actions/program-researchers";
import { LocalTime } from "../ui/local-time";

// Matches the server default (expires_in_hours = 168) in invite_researcher_to_program.
// If that default ever changes, change it here too.
const INVITATION_EXPIRY_DAYS = 7;

/** An address with an @ in the middle is an email; anything else (with or without a leading @)
 * is a researcher's username, whose email the organization never sees. */
const isEmail = (value: string) => /^[^@s]+@[^@s]+$/.test(value.trim());

export function InviteResearcherDialog({ organizationId, programId }: { organizationId: string; programId: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  // After sending: the link (shown once) and whether the email went out.
  const [sent, setSent] = useState<{ inviteUrl: string; emailSent: boolean } | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setStep("form");
    setSent(null);
    setEmail("");
    setMessage("");
    setError(null);
  }

  function handleContinue(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter an email address or a @username.");
      return;
    }
    setStep("confirm");
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const input = { organizationId, programId, message: message.trim() || undefined };
      const result = isEmail(email) ? await inviteResearcherToProgram({ ...input, email }) : await inviteResearcherByUsernameToProgram({ ...input, username: email });
      if (!result.ok) {
        setError(result.message);
        setStep("form");
        return;
      }
      setSent(result.data);
    });
  }

  const expires = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite researcher</Button>
      <Dialog open={open} title={sent ? "Invitation created" : step === "form" ? "Invite a researcher" : "Confirm invitation"} onClose={close}>
        {sent ? (
          <InvitationSentPanel email={isEmail(email) ? email : `@${email.trim().replace(/^@/, "")}`} inviteUrl={sent.inviteUrl} emailSent={sent.emailSent} onDone={close} />
        ) : step === "form" ? (
          <form className="space-y-4" onSubmit={handleContinue}>
            <p className="text-sm text-ink-muted">The researcher does not need an existing Unpatched account. They will not gain any organization access.</p>
            <Input label="Email or @username" required value={email} onChange={(event) => setEmail(event.target.value)} error={error ?? undefined} helperText="Use their username to invite a researcher from the leaderboard; their email stays private." />
            <Textarea label="Message" helperText="Optional. Included with the invitation." value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} />
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
              <p className="mt-1 font-semibold text-ink">{isEmail(email) ? email : `@${email.trim().replace(/^@/, "")}`}</p>
              <p className="mt-3 text-ink-muted">Access</p>
              <p className="mt-1">This program only. No organization access, no access to other programs.</p>
              <p className="mt-3 text-ink-muted">Invitation expires</p>
              <p className="mt-1"><LocalTime value={expires} /></p>
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
