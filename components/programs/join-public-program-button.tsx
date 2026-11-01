"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "../ui/button";
import { joinPublicProgramAction } from "../../actions/programs";

/**
 * The one new researcher-facing action this slice adds (see docs/decisions/0041): joins
 * the program (creating the same program_researchers row an invitation acceptance
 * would), then routes to the existing, completely unchanged report-submission page --
 * which itself re-checks authorization independently. This button never submits a report
 * itself.
 */
export function JoinPublicProgramButton({ organizationId, programId }: { organizationId: string; programId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await joinPublicProgramAction({ programId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/organizations/${organizationId}/programs/${programId}/reports/new` as Route);
    });
  }

  return (
    <div>
      <Button onClick={handleClick} pending={pending}>
        Start researching <span aria-hidden="true">→</span>
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
