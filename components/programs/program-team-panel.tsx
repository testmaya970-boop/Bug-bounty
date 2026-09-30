"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "../ui/feedback";
import { Button } from "../ui/button";
import { Select } from "../ui/form";
import { SectionLabel } from "../ui/security-primitives";
import {
  assignProgramMemberAction,
  unassignProgramMemberAction,
} from "../../actions/programs";
import type { ProgramMemberRecord } from "../../types/program";

export type ProgramTeamCandidate = {
  userId: string;
  displayName: string;
  email: string | null;
  role: "program_manager" | "triager";
};

const PROGRAM_ROLE_LABEL: Record<ProgramMemberRecord["role"], string> = {
  manager: "Program Manager",
  triager: "Triager",
};
const WHAT_THEY_DO: Record<ProgramMemberRecord["role"], string> = {
  manager: "Runs this program and decides bounties",
  triager: "Reads and triages this program's reports",
};

/**
 * Who works this program (202609250012). Owners and security admins reach every program
 * already, so only Program Managers and Triagers are assigned -- the program role follows
 * their organization role. Rendered for org admins only; the database enforces the same.
 */
export function ProgramTeamPanel({
  organizationId,
  programId,
  members,
  candidates,
}: {
  organizationId: string;
  programId: string;
  members: ProgramMemberRecord[];
  candidates: ProgramTeamCandidate[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    action: () => ReturnType<typeof assignProgramMemberAction>,
    after?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  return (
    <section aria-label="Program team">
      <Panel className="space-y-4 p-5">
        <div>
          <SectionLabel>Program team</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">
            Program Managers and Triagers only see the programs they are
            assigned to. Owners and Security Admins already reach every program.
          </p>
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-ink-muted">No one is assigned yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {members.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {member.displayName}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {PROGRAM_ROLE_LABEL[member.role]} ·{" "}
                    {WHAT_THEY_DO[member.role]}
                  </p>
                </div>
                <Button
                  variant="quiet"
                  className="text-danger"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      unassignProgramMemberAction({
                        organizationId,
                        programId,
                        userId: member.userId,
                      }),
                    )
                  }
                >
                  Remove
                  <span className="sr-only">
                    {" "}
                    {member.displayName} from this program
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}

        {candidates.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2">
            <Select
              label="Assign a team member"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="min-w-64 flex-1"
            >
              <option value="">Choose a Program Manager or Triager…</option>
              {candidates.map((candidate) => (
                <option key={candidate.userId} value={candidate.userId}>
                  {candidate.displayName} (
                  {candidate.role === "program_manager"
                    ? "Program Manager"
                    : "Triager"}
                  )
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              pending={pending}
              disabled={!selected}
              onClick={() =>
                run(
                  () =>
                    assignProgramMemberAction({
                      organizationId,
                      programId,
                      userId: selected,
                    }),
                  () => setSelected(""),
                )
              }
            >
              Assign
            </Button>
          </div>
        ) : (
          <p className="text-xs text-ink-muted">
            Everyone with the Program Manager or Triager role is already on this
            program. Invite more from Members.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </Panel>
    </section>
  );
}
