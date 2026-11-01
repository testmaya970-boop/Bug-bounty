"use client";

import React, { useState, useTransition } from "react";
import { InvitationSentPanel } from "../organizations/invitation-sent-panel";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Input, Textarea } from "../ui/form";
import { inviteResearcherByUsernameToProgram } from "../../actions/program-researchers";
import { LocalTime } from "../ui/local-time";

// Matches the server's 168-hour expiry in invite_researcher_by_username.
// If that default ever changes, change it here too.
const INVITATION_EXPIRY_DAYS = 7;

/** Researchers are invited by @username only (2026-10-30): an organization never sees, and so
 * never needs, a researcher's email. Something shaped like an email is refused with a hint. */
// `\s`, not `s`: a lost backslash once sent every address containing the letter "s" down
// the wrong path.
export const isEmail = (value: string) => /^[^@\s]+@[^@\s]+$/.test(value.trim());

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
      setError("Enter the researcher's @username.");
      return;
    }
    if (isEmail(email)) {
      setError("Invite researchers by @username. You'll find it under their name on the leaderboard; their email stays private.");
      return;
    }
    setStep("confirm");
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const input = { organizationId, programId, message: message.trim() || undefined };
      const result = await inviteResearcherByUsernameToProgram({ ...input, username: email });
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
          <InvitationSentPanel email={`@${email.trim().replace(/^@/, "")}`} inviteUrl={sent.inviteUrl} emailSent={sent.emailSent} onDone={close} />
        ) : step === "form" ? (
          <form className="space-y-4" onSubmit={handleContinue}>
            <p className="text-sm text-ink-muted">Invite a researcher on Unpatched by their @username. They get access to this program only, never to your organization.</p>
            <Input label="@username" required value={email} onChange={(event) => setEmail(event.target.value)} error={error ?? undefined} helperText="Shown under each researcher's name on the leaderboard. Their email stays private." />
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
              <p className="mt-1 font-semibold text-ink">{`@${email.trim().replace(/^@/, "")}`}</p>
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
