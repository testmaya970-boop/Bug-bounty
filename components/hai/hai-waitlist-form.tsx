"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { joinHaiWaitlistAction } from "../../actions/hai";

/** Hai's one real action: a persisted waitlist join (public.hai_waitlist_entries), not a
 * fake "thanks!" over nothing -- same honesty posture as FeedbackSettings. `alreadyOn`
 * reflects a real prior signup (server-checked before this component even renders);
 * `joined` tracks a signup that happened in this click, so the two read slightly
 * differently ("You're on the list" vs "Added -- you're on the list") without either one
 * lying about what just happened. */
export function HaiWaitlistForm({ alreadyOn }: { alreadyOn: boolean }) {
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      const result = await joinHaiWaitlistAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setJoined(true);
    });
  }

  if (alreadyOn || joined) {
    return (
      <Alert tone="success" title="You're on the list.">
        We'll reach out here when there's something real to try.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="button" pending={pending} onClick={handleJoin}>
        Join the waitlist
      </Button>
    </div>
  );
}
