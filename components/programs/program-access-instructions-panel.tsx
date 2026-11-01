"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Panel } from "../ui/feedback";
import { Textarea } from "../ui/form";
import { updateProgramAccessInstructionsAction } from "../../actions/programs";

/**
 * How an already-authorized researcher actually reaches this program's targets -- VPN
 * credentials, a required contact, a separate credentialing system, whatever a private/
 * internal engagement needs. Deliberately not something the platform provisions itself
 * (that would mean owning credential lifecycle and network security for someone else's
 * infrastructure): this is instructions text an org manager writes, the same boundary
 * HackerOne's own rules-of-engagement content draws. See
 * db/migrations/202609240001_program_access_instructions.sql for why this is a separate
 * field from the public program description, never merged into it -- this text is only
 * ever sent to a manager or a researcher already authorized on this specific program,
 * never to the public.
 */
export function ProgramAccessInstructionsEditor({ organizationId, programId, accessInstructions }: { organizationId: string; programId: string; accessInstructions: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(accessInstructions ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateProgramAccessInstructionsAction({ organizationId, programId, accessInstructions: value });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Panel className="space-y-4 p-5">
      <Textarea
        label="Access instructions"
        helperText="Shown only to researchers you've let in."
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={5000}
        placeholder="e.g. Connect to the test VPN first. Ask security@example.com for credentials."
      />
      <Button variant="secondary" onClick={handleSave} pending={pending}>
        Save access instructions
      </Button>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </Panel>
  );
}

/** The researcher-facing read of the same field -- plain text, never editable, never
 * shown at all when empty (an org that hasn't written anything has nothing to say here,
 * not a blank panel worth rendering). */
export function ProgramAccessInstructionsNotice({ accessInstructions }: { accessInstructions: string | null }) {
  if (!accessInstructions) return null;
  return (
    <Panel className="space-y-2 p-5">
      <h2 className="text-base font-semibold text-ink">Access instructions</h2>
      <p className="whitespace-pre-wrap break-words text-sm text-ink-muted">{accessInstructions}</p>
    </Panel>
  );
}
