"use client";

import React, { useState, useTransition } from "react";
import { Checkbox } from "../ui/form";
import { setMyLeaderboardVisibilityAction } from "../../actions/researcher-profiles";

/** The researcher's own opt-out from the public leaderboard (202610300004). Shown by default,
 * with name and @username; unticked, everyone else sees "Anonymous researcher" in that row. */
export function LeaderboardVisibilityToggle({ visible }: { visible: boolean }) {
  const [checked, setChecked] = useState(visible);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Checkbox
        label="Show my name and @username on the public leaderboard"
        checked={checked}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.checked;
          setChecked(next);
          setError(null);
          startTransition(async () => {
            const result = await setMyLeaderboardVisibilityAction({ visible: next });
            if (!result.ok) {
              setChecked(!next);
              setError(result.message);
            }
          });
        }}
      />
      <span className="text-xs text-ink-muted">{checked ? "Organizations can find and invite you by @username." : "You appear as “Anonymous researcher” to everyone else."}</span>
      {error && (
        <p role="alert" className="w-full text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
