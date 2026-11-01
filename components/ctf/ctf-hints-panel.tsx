"use client";

import React, { useState, useTransition } from "react";
import { Lightbulb, LockSimple } from "@phosphor-icons/react";
import { Card } from "../ui/feedback";
import { Button } from "../ui/button";
import { SectionLabel } from "../ui/security-primitives";
import { takeCtfHintAction } from "../../actions/ctf";
import type { CtfHint } from "../../services/ctf";

/**
 * Progressive, paid hints. Only costs arrive with the page; a hint's text comes back from
 * take_ctf_hint after the researcher confirms the cost, and each taken hint lowers what the
 * solve awards (the database applies it, this panel only shows the running value).
 */
export function CtfHintsPanel({ challengeId, points, solved, initialHints }: { challengeId: string; points: number; solved: boolean; initialHints: CtfHint[] }) {
  const [hints, setHints] = useState(initialHints);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (hints.length === 0) return null;
  const spent = hints.filter((h) => h.taken).reduce((sum, h) => sum + h.cost, 0);
  const nextPosition = hints.find((h) => !h.taken)?.position ?? null;

  function reveal(position: number) {
    setError(null);
    startTransition(async () => {
      const result = await takeCtfHintAction({ challengeId, position });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setHints((current) => current.map((h) => (h.position === position ? { ...h, taken: true, body: result.data.body } : h)));
      setConfirming(null);
    });
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <SectionLabel>Hints</SectionLabel>
        {!solved && (
          <p className="font-mono text-xs text-ink-muted tabular-nums" aria-live="polite">
            Solve value <span className="font-semibold text-ink">{Math.max(points - spent, 0)}</span> of {points} pts
          </p>
        )}
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        {solved ? "Your solve is recorded, so hints no longer change its points." : "Hints unlock in order. Each one you reveal is subtracted from the points this challenge awards."}
      </p>

      <ol className="mt-4 space-y-2">
        {hints.map((hint) => {
          const label = `Hint ${hint.position}`;
          if (hint.taken) {
            return (
              <li key={hint.position} className="rounded-md border border-border bg-surface-muted p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                    <Lightbulb aria-hidden="true" weight="fill" className="size-4 text-warning" />
                    {label}
                  </span>
                  <span className="font-mono text-[11px] text-ink-muted">Cost {hint.cost} pts</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink">{hint.body}</p>
              </li>
            );
          }

          if (hint.position !== nextPosition) {
            return (
              <li key={hint.position} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border p-3 text-sm text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <LockSimple aria-hidden="true" className="size-4" />
                  {label}
                </span>
                <span className="font-mono text-[11px]">
                  {hint.cost} pts, after hint {hint.position - 1}
                </span>
              </li>
            );
          }

          return (
            <li key={hint.position} className="rounded-md border border-border p-3">
              {confirming === hint.position ? (
                <div role="group" aria-label={`Confirm ${label.toLowerCase()}`}>
                  <p className="text-sm text-ink">
                    Reveal {label.toLowerCase()} for <span className="font-semibold">{hint.cost} pts</span>?
                    {!solved && ` Solving will then award ${Math.max(points - spent - hint.cost, 0)} pts.`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => reveal(hint.position)} pending={pending}>
                      Reveal for {hint.cost} pts
                    </Button>
                    <Button variant="quiet" onClick={() => setConfirming(null)} disabled={pending}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">
                    {label} <span className="font-mono text-xs font-normal text-ink-muted">costs {hint.cost} pts</span>
                  </span>
                  <Button variant="secondary" onClick={() => { setError(null); setConfirming(hint.position); }}>
                    Reveal {label.toLowerCase()}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
