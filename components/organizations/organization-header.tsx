import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { SectionLabel } from "../ui/security-primitives";
import { cn } from "../../lib/cn";

export type OrganizationSection = "overview" | "programs" | "findings" | "assets" | "analytics" | "researchers" | "members" | "settings";

/** The one consistent organization-level workspace header -- eyebrow, name, and the same
 * six-item sub-navigation on every organization-scoped page, so moving between Home /
 * Engagements / Analytics / Researchers / Members / Settings feels like one product
 * rather than six independently designed pages. "Settings" links to the real,
 * per-organization `/organizations/{id}/settings` route. The `id`/route for the first tab
 * stays "overview" (no new route, no duplicate page -- Home recomposes the existing
 * Overview page in place, see app/organizations/[organizationId]/page.tsx's own comment);
 * only its label changed to match the page's real, broader identity. The second tab's
 * `id`/route similarly stays "programs" (the real underlying route,
 * `/organizations/{id}/programs`, is completely unchanged -- same programs, same URLs,
 * same permissions) -- only its label changed to "Engagements" to match the page's real,
 * HackerOne-style category-tab identity (docs/decisions/0076). Never conflate "the label
 * a user sees" with "the id/route this codebase uses internally" -- renaming one does not
 * require renaming the other, and renaming both would have meant touching every
 * `active="programs"` caller across the org-scoped page set for zero real benefit.
 *
 * "Researchers" sits between Analytics and Members deliberately: it is a cross-program
 * intelligence surface like Analytics (read-only, org-wide), positioned before Members
 * (internal org staff/RBAC) so its placement itself signals "external research
 * population," distinct from internal team management.
 *
 * "Findings" sits between Engagements and Analytics -- the flat, cross-program report
 * list (every finding across every engagement, filterable/paginated; see
 * app/organizations/[organizationId]/findings/page.tsx and
 * services/reports.ts's listReportsForOrganization), distinct from both the
 * single-program triage inbox (.../programs/{id}/reports, which still owns triage
 * actions/bulk operations) and Analytics (aggregate numbers, not individual rows). Read
 * access matches every other org-wide read surface here: any active member, with RLS
 * itself narrowing which rows come back (an org owner/security_admin sees every report, a
 * plain member who manages no program sees none) -- never a second, page-level permission
 * model duplicating what RLS already decides correctly.
 *
 * "Assets" sits between Findings and Analytics -- the flat, cross-program scope/asset
 * inventory (extends public.program_scope_entries, docs/decisions/0006-scope-asset-model.md;
 * see app/organizations/[organizationId]/assets/page.tsx), same read-access shape as
 * Findings. Creation/editing still happens on each engagement's own Scope section (scope
 * mutation is only legal while that program is in draft, program-by-program), so this
 * page is read-only with a "Manage on program" link per row. */
export function OrganizationHeader({ organizationId, organizationName, active }: { organizationId: string; organizationName: string; active: OrganizationSection }) {
  const items: { id: OrganizationSection; label: string; href: Route }[] = [
    { id: "overview", label: "Home", href: `/organizations/${organizationId}` as Route },
    { id: "programs", label: "Engagements", href: `/organizations/${organizationId}/programs` as Route },
    { id: "findings", label: "Findings", href: `/organizations/${organizationId}/findings` as Route },
    { id: "assets", label: "Assets", href: `/organizations/${organizationId}/assets` as Route },
    { id: "analytics", label: "Analytics", href: `/organizations/${organizationId}/analytics` as Route },
    { id: "researchers", label: "Researchers", href: `/organizations/${organizationId}/researchers` as Route },
    { id: "members", label: "Members", href: `/organizations/${organizationId}/members` as Route },
    { id: "settings", label: "Settings", href: `/organizations/${organizationId}/settings` as Route },
  ];

  return (
    <div className="border-b border-border pb-0">
      <SectionLabel>Organization</SectionLabel>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{organizationName}</h2>
      <nav aria-label="Organization sections" className="mt-4 flex gap-5 overflow-x-auto">
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
