"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, LockSimple } from "@phosphor-icons/react";
import { Card } from "../ui/feedback";
import { Button } from "../ui/button";
import { Textarea } from "../ui/form";
import { SectionLabel } from "../ui/security-primitives";
import { LocalTime } from "../ui/local-time";
import { deleteCtfWriteupAction, publishCtfWriteupAction } from "../../actions/ctf";
import type { CtfWriteup } from "../../services/ctf";

const MAX = 2000;

/** Shown before a solve: write-ups exist, but the database only returns them to solvers. */
export function CtfWriteupsLocked() {
  return (
    <Card className="p-5 sm:p-6">
      <SectionLabel>Write-ups</SectionLabel>
      <p className="mt-2 flex items-start gap-2 text-sm text-ink-muted">
        <LockSimple aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        The official write-up and other researchers&apos; write-ups unlock when you solve this challenge.
      </p>
    </Card>
  );
}

/**
 * After a solve: the official write-up, solvers' own write-ups (plain text, rendered as text),
 * and a form to publish or replace the researcher's own. Length and plain-text rules are the
 * database's (publish_ctf_writeup); the counter here only mirrors them.
 */
export function CtfWriteupsPanel({ challengeId, writeups }: { challengeId: string; writeups: CtfWriteup[] }) {
  const router = useRouter();
  const official = writeups.find((w) => w.official);
  const mine = writeups.find((w) => w.mine);
  const others = writeups.filter((w) => !w.official && !w.mine);
  const [editing, setEditing] = useState(!mine);
  const [draft, setDraft] = useState(mine?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await publishCtfWriteupAction({ challengeId, body: draft });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCtfWriteupAction({ challengeId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft("");
      setEditing(true);
      router.refresh();
    });
  }

  return (
    <>
      {official && (
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <BookOpenText aria-hidden="true" className="size-4 text-action" />
            <SectionLabel>Official write-up</SectionLabel>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">{official.body}</p>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionLabel>Solver write-ups</SectionLabel>
          <span className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">Visible to solvers only</span>
        </div>

        {mine && !editing ? (
          <article aria-label="Your write-up" className="mt-4 rounded-md border border-action/40 bg-action/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">Your write-up</p>
              {mine.publishedAt && (
                <span className="font-mono text-[11px] text-ink-muted">
                  <LocalTime value={mine.publishedAt} />
                </span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{mine.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => { setDraft(mine.body); setEditing(true); }} disabled={pending}>
                Edit
              </Button>
              <Button variant="destructive" onClick={remove} pending={pending}>
                Delete
              </Button>
            </div>
          </article>
        ) : (
          <form onSubmit={publish} className="mt-4 space-y-3">
            <Textarea
              label="Your write-up"
              helperText={`Plain text, 40 to ${MAX} characters. Explain the bug and how you got the flag, without pasting the flag. ${draft.length}/${MAX}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX}
              error={error ?? undefined}
              rows={5}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" pending={pending} disabled={draft.trim().length < 40}>
                {mine ? "Save write-up" : "Publish write-up"}
              </Button>
              {mine && (
                <Button variant="quiet" onClick={() => { setEditing(false); setError(null); }} disabled={pending}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}

        {error && mine && !editing && (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}

        {others.length > 0 ? (
          <ul className="mt-5 space-y-3 border-t border-border pt-5">
            {others.map((w) => (
              <li key={w.id}>
                <article className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-ink">{w.author}</p>
                    {w.publishedAt && (
                      <span className="font-mono text-[11px] text-ink-muted">
                        <LocalTime value={w.publishedAt} />
                      </span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{w.body}</p>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 border-t border-border pt-5 text-sm text-ink-muted">No other solver has published a write-up yet.</p>
        )}
      </Card>
    </>
  );
}
