"use client";

import React, { useState, useTransition } from "react";
import { Textarea } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { submitMyFeedbackAction } from "../../actions/feedback";

/** A real, persisted submission (public.researcher_feedback) -- no response/ticketing
 * workflow exists yet; disclosed, not implied. See docs/decisions/0055. */
export function FeedbackSettings() {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitMyFeedbackAction({ message });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSent(true);
      setMessage("");
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Textarea label="Your feedback" value={message} onChange={(event) => { setMessage(event.target.value); setSent(false); }} maxLength={4000} className="[&_textarea]:min-h-36" placeholder="What's working, what isn't, what you'd like to see." />
      {sent && <Alert tone="success" title="Sent. Thank you.">There's no automated response. A real person reads this.</Alert>}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Send feedback
        </Button>
      </div>
    </form>
  );
}
