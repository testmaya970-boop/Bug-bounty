"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { markContactRequestHandledAction } from "../../actions/contact";

export function MarkContactHandledButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        pending={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await markContactRequestHandledAction(id);
            if (!result.ok) setError(result.message);
            else router.refresh();
          })
        }
      >
        Mark handled
      </Button>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
