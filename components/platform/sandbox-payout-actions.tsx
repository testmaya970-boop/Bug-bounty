"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { completeSandboxPayoutAction } from "../../actions/integrations";

/** Stands in for the payout provider's webhook on a sandbox payout. */
export function SandboxPayoutActions({ reference }: { reference: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const finish = (outcome: "succeeded" | "failed") =>
    startTransition(async () => {
      setError(null);
      const result = await completeSandboxPayoutAction({ reference, outcome });
      if (!result.ok) return setError(result.message);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" pending={pending} className="min-h-9 px-3 text-xs" onClick={() => finish("succeeded")}>
        Mark paid
      </Button>
      <Button type="button" variant="secondary" pending={pending} className="min-h-9 px-3 text-xs" onClick={() => finish("failed")}>
        Mark failed
      </Button>
      {error && (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
