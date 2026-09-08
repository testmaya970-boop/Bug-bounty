"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Panel } from "../ui/feedback";
import { Switch, Textarea } from "../ui/form";
import { setProgramVisibilityAction, updateProgramDescriptionAction } from "../../actions/programs";
import type { ProgramVisibility } from "../../types/program";

/**
 * The minimum UI needed to make a program public (see docs/decisions/0041) -- not a
 * marketplace management dashboard. Visibility can be toggled at any lifecycle stage;
 * it only takes visible effect once the program reaches active/paused (enforced
 * server-side by list_public_programs/get_public_program, not by disabling this control).
 */
export function ProgramVisibilityPanel({
  organizationId,
  programId,
  visibility,
  description,
}: {
  organizationId: string;
  programId: string;
  visibility: ProgramVisibility;
  description: string | null;
}) {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(visibility === "public");
  const [descriptionValue, setDescriptionValue] = useState(description ?? "");
  const [visibilityPending, startVisibilityTransition] = useTransition();
  const [descriptionPending, startDescriptionTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleVisibilityToggle(next: boolean) {
    setIsPublic(next);
    setError(null);
    startVisibilityTransition(async () => {
      const result = await setProgramVisibilityAction({ organizationId, programId, visibility: next ? "public" : "private" });
      if (!result.ok) {
        setIsPublic(!next);
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function handleDescriptionSave() {
    setError(null);
    startDescriptionTransition(async () => {
      const result = await updateProgramDescriptionAction({ organizationId, programId, description: descriptionValue });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Panel className="space-y-4 p-5">
      <Switch label={isPublic ? "Public: researchers can discover this program" : "Private: not listed publicly, invite researchers directly"} checked={isPublic} onChange={handleVisibilityToggle} />
      {visibilityPending && <p className="text-xs text-ink-muted">Saving…</p>}

      <Textarea
        label="Public description"
        helperText="Shown on the program's public page once it is Public and Active. Company overview, what to test, submission notes."
        value={descriptionValue}
        onChange={(event) => setDescriptionValue(event.target.value)}
        maxLength={5000}
      />
      <Button variant="secondary" onClick={handleDescriptionSave} pending={descriptionPending}>
        Save description
      </Button>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </Panel>
  );
}
