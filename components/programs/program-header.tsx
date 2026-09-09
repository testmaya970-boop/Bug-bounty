"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ChevronsUpDown, Check } from "lucide-react";
import { SectionLabel } from "../ui/security-primitives";
import { ProgramStatusBadge } from "../ui/badge";
import { Separator } from "../ui/feedback";
import { cn } from "../../lib/cn";
import type { ProgramStatus, ProgramType } from "../../types/program";

export type ProgramSection = "overview" | "reports" | "inbox" | "researchers" | "scope";

export type ProgramSwitcherEntry = { id: string; name: string; status: ProgramStatus };

/** Item 11 of the 15-point nav map (Turn 6, phase/9-ia): a dropdown for jumping between
 * this organization's other programs, visible only inside a program context (i.e. only
 * when a caller passes `siblingPrograms`) -- distinct from ProgramHeader's own section
 * tabs above, which move within one program. Per the fetch-ownership rule, this component
 * fetches nothing itself: the page that renders ProgramHeader already fetches its own
 * programs list for other reasons (or fetches it fresh for this), and passes it down. */
function ProgramSwitcher({ organizationId, programId, programName, siblingPrograms }: { organizationId: string; programId: string; programName: string; siblingPrograms: ProgramSwitcherEntry[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function handleSwitch(targetProgramId: string) {
    setOpen(false);
    if (targetProgramId === programId) return;
    router.push(`/organizations/${organizationId}/programs/${targetProgramId}` as Route);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch program"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-ink-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
      >
        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0" />
      </button>

      {open && (
        <div role="menu" aria-label="Switch program" className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface p-1 shadow-lg">
          <button
            type="button"
            role="menuitemradio"
            aria-checked="true"
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 text-left text-sm hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          >
            <span className="min-w-0 flex-1 truncate text-ink">{programName}</span>
            <Check aria-hidden="true" className="size-4 shrink-0 text-ink" />
          </button>
          {siblingPrograms.length > 0 && <Separator className="my-1" />}
          {siblingPrograms.map((program) => (
            <button
              key={program.id}
              type="button"
              role="menuitemradio"
              aria-checked="false"
              onClick={() => handleSwitch(program.id)}
              className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 text-left text-sm hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
            >
              <span className="min-w-0 flex-1 truncate text-ink-muted">{program.name}</span>
            </button>
          ))}
          <Separator className="my-1" />
          <Link
            href={`/organizations/${organizationId}/programs` as Route}
            prefetch={false}
            onClick={() => setOpen(false)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 text-sm text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          >
            All engagements
          </Link>
        </div>
      )}
    </div>
  );
}

/** The one consistent program-level workspace header -- eyebrow, name, real status, and
 * the same sub-navigation everywhere a program is the current context (the program detail
 * page and its dedicated triage inbox). "Scope" is a section on the detail page itself
 * (an anchor), not a separate route. "Researchers" and "Reports" are both manager-only:
 * "Reports" links to the dedicated triage inbox route, which is itself manager-authorized
 * only (see app/.../reports/page.tsx's own PermissionDenied for a non-manager) -- showing
 * the tab to a researcher who can only ever land on that denial is exactly the same class
 * of dead-end navigation as the sidebar "Organizations" link a researcher with no
 * organization has no use for (see docs/decisions/0044). A researcher's own reports for
 * this specific program are already inline on the Overview tab itself (ProgramReportList),
 *
 * "Inbox" is a second, manager-only triage surface distinct from "Reports": "Reports" is
 * the dense full-table view (every filter, bulk mark-duplicate, every column) at
 * .../reports; "Inbox" is the 3-column split-view (list / timeline / quick actions) at
 * .../inbox, optimized for working through reports one at a time rather than scanning a
 * table. Both read/act on the exact same reports -- no separate dataset, no separate
 * authorization model, just two different working shapes over one real inbox.
 * so hiding this tab removes no real capability. */
export function ProgramHeader({
  organizationId,
  programId,
  programName,
  status,
  programType,
  active,
  canManage,
  siblingPrograms,
}: {
  organizationId: string;
  programId: string;
  programName: string;
  status: ProgramStatus;
  programType?: ProgramType;
  active: ProgramSection;
  canManage: boolean;
  /** The org's other programs, for the switcher dropdown -- omitted entirely (no
   * switcher renders) rather than defaulted to [], so a caller that hasn't fetched this
   * yet doesn't silently render a switcher with nothing in it. */
  siblingPrograms?: ProgramSwitcherEntry[];
}) {
  const base = `/organizations/${organizationId}/programs/${programId}`;
  const items: { id: ProgramSection; label: string; href: Route }[] = [
    { id: "overview", label: "Overview", href: base as Route },
    { id: "scope", label: "Scope", href: `${base}#scope` as Route },
    ...(canManage ? [{ id: "researchers" as const, label: "Researchers", href: `${base}#researchers` as Route }] : []),
    ...(canManage ? [{ id: "inbox" as const, label: "Inbox", href: `${base}/inbox` as Route }] : []),
    ...(canManage ? [{ id: "reports" as const, label: "Reports", href: `${base}/reports` as Route }] : []),
  ];

  return (
    <div className="border-b border-border pb-0">
      <SectionLabel>Program</SectionLabel>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{programName}</h2>
        <ProgramStatusBadge status={status} />
        {programType === "vdp" && (
          <span className="rounded-full border border-border-strong px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Disclosure only</span>
        )}
        {siblingPrograms && <ProgramSwitcher organizationId={organizationId} programId={programId} programName={programName} siblingPrograms={siblingPrograms} />}
      </div>
      {/* prefetch={false}: same reasoning as organization-header.tsx's own tabs -- avoid
          feeding the App Router's speculative prefetch, which would otherwise run the
          full (deliberately unconditional) middleware auth gate for every tab on every
          render. */}
      <nav aria-label="Program sections" className="mt-4 flex gap-5 overflow-x-auto">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            prefetch={false}
            aria-current={active === item.id ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 pb-3 text-sm font-semibold transition-[color,border-color,box-shadow] duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
              active === item.id ? "border-action text-ink shadow-[0_1px_8px_var(--glow-action)]" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
