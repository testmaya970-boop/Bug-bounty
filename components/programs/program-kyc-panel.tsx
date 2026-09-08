"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "../ui/feedback";
import { Switch } from "../ui/form";
import { setProgramKycRequirementAction } from "../../actions/programs";

/**
 * A single toggle requiring identity verification before a researcher can join or submit
 * to this program -- see supabase/migrations/202609050012_program_kyc_requirement.sql.
 * Mirrors ProgramVisibilityPanel's exact optimistic-update-then-revert-on-error pattern.
 */
export function ProgramKycPanel({ organizationId, programId, requiresKyc }: { organizationId: string; programId: string; requiresKyc: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(requiresKyc);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle(next: boolean) {
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await setProgramKycRequirementAction({ organizationId, programId, requiresKyc: next });
      if (!result.ok) {
        setEnabled(!next);
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Panel className="space-y-4 p-5">
      <Switch
        label={enabled ? "Required: researchers must verify their identity before joining or submitting" : "Not required: any authorized researcher can join or submit"}
        checked={enabled}
        onChange={handleToggle}
      />
      {pending && <p className="text-xs text-ink-muted">Saving…</p>}

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </Panel>
  );
}
