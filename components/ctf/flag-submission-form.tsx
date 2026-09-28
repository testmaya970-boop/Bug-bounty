"use client";

import React, { useState, useTransition } from "react";
import { Input } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { Badge } from "../ui/badge";
import { submitCtfFlagAction } from "../../actions/ctf";
import type { CtfSolve } from "../../services/ctf";
import type { MockCtfChallenge } from "../../lib/mock/ctf";
import { LocalTime } from "../ui/local-time";

/**
 * The rail's one primary action on a challenge detail page -- a real Server Action call
 * (docs/decisions/0072), not a client-side string comparison. The plaintext flag never
 * ships to this component at all; `challenge.flag` no longer exists on `MockCtfChallenge`
 * as of this change. Once solved, the form is replaced by a solved summary; there is no
 * path back to re-submitting a flag for an already-solved challenge.
 */
export function FlagSubmissionForm({ challenge, initialSolve }: { challenge: MockCtfChallenge; initialSolve: CtfSolve | null }) {
  const [solve, setSolve] = useState(initialSolve);
  const [submission, setSubmission] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitCtfFlagAction({ challengeId: challenge.id, flag: submission });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (!result.data.correct) {
        setError("Incorrect flag. Try again.");
        return;
      }
      setSolve({ challengeId: challenge.id, pointsAwarded: result.data.alreadySolved ? challenge.points : result.data.pointsAwarded, solvedAt: new Date().toISOString() });
    });
  }

  if (solve) {
    return (
      <div className="space-y-3">
        <Badge className="text-success" dotClassName="bg-success" pulse>
          Solved
        </Badge>
        <Alert tone="success" title={`+${solve.pointsAwarded} points`}>
          Solved <LocalTime value={solve.solvedAt} />.
        </Alert>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        label="Flag"
        placeholder={challenge.flagFormatHint}
        value={submission}
        onChange={(event) => setSubmission(event.target.value)}
        error={error ?? undefined}
        required
        autoComplete="off"
        spellCheck={false}
      />
      <Button type="submit" className="w-full" pending={pending}>
        Submit flag
      </Button>
    </form>
  );
}
