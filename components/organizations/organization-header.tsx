import React from "react";
import { SectionLabel } from "../ui/security-primitives";
import { OrgLogo } from "../ui/org-logo";

/**
 * Turn 8b: the org-level tab row this component used to render is deleted -- nine
 * destinations behind two independently-highlighting nav controls (this row's own
 * `active === item.id` check, and the sidebar's `path === href` check) was a real,
 * screenshotted defect: the tab row never matched a program sub-route or a member-detail
 * page, so on those pages "Engagements"/"Members" went dark in BOTH controls at once,
 * leaving no visible "you are here" anywhere. New standing rule (AGENTS.md): one
 * hierarchy level, one nav control. The grouped sidebar (Overview / Security / Insights /
 * Organization, components/app-shell-client.tsx) is now the single org nav, with active
 * state correctly derived from pathname (including sub-routes) on every org route.
 *
 * What's left here is identity only -- the eyebrow + organization name every org-scoped
 * page still shows once, directly under its own breadcrumb. No `active` prop, because
 * there is no second nav here anymore to highlight anything in.
 */
export function OrganizationHeader({ organizationName, organizationId, logoVersion }: { organizationName: string; organizationId?: string; logoVersion?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-border pb-4">
      {organizationId && logoVersion && <OrgLogo organizationId={organizationId} name={organizationName} version={logoVersion} size="lg" />}
      <div className="min-w-0">
        <SectionLabel>Organization</SectionLabel>
        <h2 className="mt-1 break-words text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{organizationName}</h2>
      </div>
    </div>
  );
}
