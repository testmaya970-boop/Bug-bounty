import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { SectionLabel } from "../ui/security-primitives";
import { ProgramStatusBadge } from "../ui/badge";
import { cn } from "../../lib/cn";
import type { ProgramStatus, ProgramType } from "../../types/program";

export type ProgramSection = "overview" | "reports" | "inbox" | "researchers" | "scope";

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
}: {
  organizationId: string;
  programId: string;
  programName: string;
  status: ProgramStatus;
  programType?: ProgramType;
  active: ProgramSection;
  canManage: boolean;
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
      </div>
      <nav aria-label="Program sections" className="mt-4 flex gap-5 overflow-x-auto">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
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
