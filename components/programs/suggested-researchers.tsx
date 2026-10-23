"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { inviteResearcherByUsernameToProgram } from "../../actions/program-researchers";
import type { SuggestedResearcher } from "../../services/program-researchers";

/** Researchers to invite to a private pilot: public-profile researchers with the best track
 * record who aren't in the program yet (suggest_program_researchers). One click invites by
 * username; the researcher's email stays private. */
export function SuggestedResearchers({ organizationId, programId, researchers }: { organizationId: string; programId: string; researchers: SuggestedResearcher[] }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();
  if (researchers.length === 0) return null;

  function invite(r: SuggestedResearcher) {
    setPendingId(r.researcherId);
    start(async () => {
      const result = await inviteResearcherByUsernameToProgram({ organizationId, programId, username: r.username });
      setState((was) => ({ ...was, [r.researcherId]: result.ok ? { ok: true, text: result.data.emailSent ? "Invited" : "Invited (email not sent; share the link from pending invitations)" } : { ok: false, text: result.message } }));
      setPendingId(null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <section aria-labelledby="suggested-researchers" className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h3 id="suggested-researchers" className="text-[13px] font-semibold text-ink">
          Suggested for your private pilot
        </h3>
        <p className="text-xs text-ink-muted">Researchers with public profiles and the strongest track record on Unpatched who aren&apos;t in this program yet. 10 to 25 is a good pilot.</p>
      </div>
      <ul className="divide-y divide-border">
        {researchers.map((r) => {
          const done = state[r.researcherId];
          return (
            <li key={r.researcherId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <Link prefetch={false} href={`/researchers/${r.username}` as Route} className="block truncate text-[13px] font-medium text-ink hover:text-action">
                  {r.displayName}
                </Link>
                <span className="block truncate font-mono text-[11px] text-ink-muted">@{r.username}</span>
              </span>
              <span className="text-xs tabular-nums text-ink-muted">
                {r.score.toLocaleString("en-US")} reputation · {r.resolvedCount} resolved · {r.bountiesCount} bounties
              </span>
              {done ? (
                <span role={done.ok ? "status" : "alert"} className={`text-xs font-medium ${done.ok ? "text-success" : "text-danger"}`}>
                  {done.text}
                </span>
              ) : (
                <Button variant="secondary" pending={pendingId === r.researcherId} onClick={() => invite(r)} aria-label={`Invite @${r.username}`}>
                  Invite
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
