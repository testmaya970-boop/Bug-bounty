"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowsDownUp } from "@phosphor-icons/react";
import { Avatar } from "../ui/navigation";
import { ProgramStatusBadge, ProgramTypeBadge } from "../ui/badge";
import { formatBountyRange } from "../../lib/money";
import type { PublicProgramSummary } from "../../types/program";
import { LocalTime } from "../ui/local-time";

type SortKey = "name" | "bounty" | "researchers" | "resolved" | "updated";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Program" },
  { key: "bounty", label: "Reward range" },
  { key: "researchers", label: "Researchers" },
  { key: "resolved", label: "Resolved" },
  { key: "updated", label: "Last updated" },
];

function sortValue(program: PublicProgramSummary, key: SortKey): number | string {
  switch (key) {
    case "name":
      return program.name.toLowerCase();
    case "bounty":
      return program.bountyMaxMinorUnits ?? -1;
    case "researchers":
      return program.activeResearcherCount;
    case "resolved":
      return program.resolvedReportCount;
    case "updated":
      return program.updatedAt;
  }
}

/** The sortable table view -- client-side sort over the already-fetched page (the same
 * data PublicProgramGrid renders, just laid out for comparing many programs at once).
 * Client-side, not a re-query per column click: sorting an already-loaded page needs no
 * round trip, and "Load more" simply appends to the same array these sort keys already
 * read from. */
export function PublicProgramTable({ programs }: { programs: PublicProgramSummary[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("bounty");
  const [descending, setDescending] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...programs];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : av - (bv as number);
      return descending ? -cmp : cmp;
    });
    return copy;
  }, [programs, sortKey, descending]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setDescending((current) => !current);
    } else {
      setSortKey(key);
      setDescending(true);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {COLUMNS.map((column) => (
              <th key={column.key} scope="col" className="whitespace-nowrap px-3 py-3 font-semibold text-ink-muted">
                <button
                  type="button"
                  onClick={() => handleSort(column.key)}
                  className="inline-flex items-center gap-1.5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  aria-pressed={sortKey === column.key}
                >
                  {column.label}
                  <ArrowsDownUp aria-hidden="true" className={`size-3 ${sortKey === column.key ? "text-ink" : "text-ink-muted/50"}`} />
                </button>
              </th>
            ))}
            <th scope="col" className="whitespace-nowrap px-4 py-3 pr-5 font-semibold text-ink-muted">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((program) => (
            <tr key={program.id} className="group transition-colors hover:bg-surface-muted">
              <td className="px-4 py-3">
                <Link
                  prefetch={false}
                  href={`/organizations/${program.organizationId}/programs/${program.id}` as Route}
                  className="flex min-w-0 items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <Avatar name={program.organizationName} tinted />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink group-hover:underline">{program.name}</span>
                    <span className="block truncate text-xs text-ink-muted">{program.organizationName}</span>
                  </span>
                </Link>
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-semibold text-ink">
                {program.bountyMinMinorUnits !== null && program.bountyMaxMinorUnits !== null && program.bountyCurrency
                  ? formatBountyRange(program.bountyMinMinorUnits, program.bountyMaxMinorUnits, program.bountyCurrency)
                  : program.programType === "vdp"
                    ? <span className="font-normal text-ink-muted">Disclosure only</span>
                    : "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-ink-muted">{program.activeResearcherCount}</td>
              <td className="whitespace-nowrap px-3 py-3 text-ink-muted">{program.resolvedReportCount}</td>
              <td className="whitespace-nowrap px-3 py-3 text-ink-muted"><LocalTime value={program.updatedAt} dateOnly /></td>
              <td className="whitespace-nowrap px-4 py-3 pr-5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <ProgramStatusBadge status={program.status} />
                  <ProgramTypeBadge programType={program.programType} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
