"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { reviewDepositAction } from "../../actions/billing";

/** Confirm once the money is seen in Unpatched's account; reject with a note the organization reads. */
export function DepositReview({ depositId }: { depositId: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const review = (outcome: "confirmed" | "rejected") =>
    startTransition(async () => {
      setError(null);
      const result = await reviewDepositAction({ depositId, outcome, note });
      if (!result.ok) return setError(result.message);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-end justify-end gap-2">
      {rejecting ? (
        <>
          <Input label="Why rejected" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="w-56" />
          <Button type="button" variant="destructive" pending={pending} className="min-h-9 px-3 text-xs" onClick={() => review("rejected")}>
            Reject
          </Button>
          <Button type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => setRejecting(false)}>
            Back
          </Button>
        </>
      ) : (
        <>
          <Button type="button" pending={pending} className="min-h-9 px-3 text-xs" onClick={() => review("confirmed")}>
            Confirm received
          </Button>
          <Button type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="w-full text-right text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
