"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Dialog } from "../ui/navigation";
import type { JourneyResult } from "../../actions/researcher-journey";

/** One click that runs a (bound) server action, shows its error inline and refreshes. With
 * `confirm`, it asks first: used for anything that can't be undone. */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  confirm,
  confirmLabel,
}: {
  action: () => Promise<JourneyResult>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "destructive" | "quiet";
  confirm?: string;
  confirmLabel?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  function go() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message);
      else {
        setAsking(false);
        router.refresh();
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant={variant} pending={pending && !asking} onClick={() => (confirm ? setAsking(true) : go())}>
        {children}
      </Button>
      {error && !asking && (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      )}
      {confirm && (
        <Dialog open={asking} title={confirmLabel ?? "Are you sure?"} onClose={() => !pending && setAsking(false)}>
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">{confirm}</p>
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAsking(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant={variant === "destructive" ? "destructive" : "primary"} pending={pending} onClick={go}>
                {children}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </span>
  );
}

/** Form wrapper: collects named fields, runs the action, shows the error or a success line. */
export function JourneyForm({
  action,
  submitLabel,
  children,
  success,
  resetOnSuccess = true,
  className,
}: {
  action: (data: FormData) => Promise<JourneyResult>;
  submitLabel: string;
  children: React.ReactNode;
  success?: string;
  resetOnSuccess?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await action(data);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(true);
      if (resetOnSuccess) form.reset();
      router.refresh();
    });
  }

  return (
    <form className={className ?? "space-y-3"} onSubmit={handleSubmit} noValidate>
      {children}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {done && success && (
        <p role="status" className="text-sm font-medium text-success">
          {success}
        </p>
      )}
      <Button type="submit" pending={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
