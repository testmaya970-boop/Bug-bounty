"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { replayDeadLetteredOutboxEventAction } from "../../actions/platform-operations";

export function ReplayButton({ eventId }: { eventId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) return <p className="text-xs font-medium text-success">Queued for reprocessing.</p>;

  function handleReplay() {
    setError(null);
    startTransition(async () => {
      const result = await replayDeadLetteredOutboxEventAction({ eventId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(true);
    });
  }

  return (
    <div>
      <Button variant="secondary" pending={pending} onClick={handleReplay}>
        {pending ? "Replaying…" : "Replay"}
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
