"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { updateOrganizationDescriptionAction } from "../../actions/organizations";

/**
 * The one real, self-service organization-identity field (202609220001) -- owner/
 * security_admin only, matching every other organization-mutation gate in this
 * codebase; the RPC itself re-enforces this regardless of what this component checks,
 * the same "trust the server, not the client" posture every other settings form here
 * already follows.
 */
export function OrganizationDescriptionForm({ organizationId, initialDescription }: { organizationId: string; initialDescription: string }) {
  const router = useRouter();
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateOrganizationDescriptionAction({ organizationId, description });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <Textarea
        label="Description"
        helperText="Optional. Internal context for your team -- what this organization is, what it runs programs for."
        value={description}
        onChange={(event) => {
          setDescription(event.target.value);
          setSaved(false);
        }}
        maxLength={2000}
        className="[&_textarea]:min-h-24"
        error={error ?? undefined}
      />
      {saved && <Alert tone="success" title="Description updated." />}
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
