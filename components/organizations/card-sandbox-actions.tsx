"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "../ui/button";
import { completeSandboxCardAction } from "../../actions/billing";

export function CardSandboxActions({
  organizationId,
  reference,
}: {
  organizationId: string;
  reference: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function finish(outcome: "confirmed" | "failed") {
    startTransition(async () => {
      setError(null);
      const result = await completeSandboxCardAction({
        organizationId,
        reference,
        outcome,
      });
      if (!result.ok) return setError(result.message);
      router.push(
        `/organizations/${organizationId}/payments?card=${outcome === "confirmed" ? "done" : "cancelled"}` as Route,
      );
    });
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          pending={pending}
          onClick={() => finish("confirmed")}
        >
          Approve payment
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => finish("failed")}
        >
          Decline
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
