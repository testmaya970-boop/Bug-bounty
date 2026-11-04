import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { OrgLogo } from "../../../../components/ui/org-logo";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { PageSummary } from "../../../../components/ui/page-summary";
import { OrganizationDescriptionForm } from "../../../../components/organizations/organization-description-form";
import { OrganizationLogoForm } from "../../../../components/organizations/organization-logo-form";
import { getOrganizationLogoVersion } from "../../../../services/organization-logos";
import { canManageMembers } from "../../../../services/authorization";
import { getActorMembership } from "../../../../services/organization-members";
import { getOrganizationDescription, listCurrentUserOrganizations } from "../../../../services/organizations";
import { getCurrentUser } from "../../../../lib/auth/current-user";

const COMING_SOON = ["Program page colors", "Email branding", "Hall of Fame page design", "Custom domain for your program pages"];

/** Branding: how the organization appears to researchers. */
export default async function OrganizationBrandingPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/branding` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Branding" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }
  const canManage = canManageMembers(actor.role);
  const [organizations, description, logoVersion] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    getOrganizationDescription(organizationId),
    getOrganizationLogoVersion(organizationId),
  ]);
  const name = organizations.find((org) => org.id === organizationId)?.name ?? "Organization";

  return (
    <AppShell titleIsSection title="Branding" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: name, href: `/organizations/${organizationId}` }, { label: "Branding" }]} />
        <OrganizationHeader title="Branding" organizationName={name} organizationId={organizationId} logoVersion={logoVersion} />

        <PageSummary
          description="Your logo and description appear on your programs, in search and on your organization's pages."
          badges={[
            logoVersion ? { label: "Logo set", tone: "success" } : { label: "No logo yet", tone: "warning" },
            description ? { label: "Description set", tone: "success" } : { label: "No description yet", tone: "warning" },
          ]}
        />

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="text-base font-semibold text-ink">Logo</h2>
              <p className="mt-1 text-sm text-ink-muted">Shown on this organization&apos;s programs, in search and on its pages.</p>
              <div className="mt-3">
                {canManage ? <OrganizationLogoForm organizationId={organizationId} name={name} version={logoVersion} /> : <OrgLogo organizationId={organizationId} name={name} version={logoVersion} size="lg" />}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="text-base font-semibold text-ink">Description</h2>
              {canManage ? (
                <div className="mt-3"><OrganizationDescriptionForm organizationId={organizationId} initialDescription={description ?? ""} /></div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{description || "No description set yet."}</p>
              )}
            </section>
          </div>

          <aside aria-labelledby="preview-heading" className="rounded-2xl border border-border bg-surface p-5">
            <h2 id="preview-heading" className="text-[13px] font-semibold uppercase tracking-wider text-ink-muted">How researchers see you</h2>
            <div className="mt-4 flex items-center gap-3">
              <OrgLogo organizationId={organizationId} name={name} version={logoVersion} />
              <span className="min-w-0 truncate font-semibold text-ink">{name}</span>
            </div>
            <p className="mt-3 line-clamp-5 whitespace-pre-wrap text-sm text-ink-muted">{description || "No description yet."}</p>
          </aside>
        </div>

        <section aria-labelledby="brand-soon-heading" className="space-y-3">
          <h2 id="brand-soon-heading" className="text-base font-semibold text-ink">Coming soon</h2>
          <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {COMING_SOON.map((title) => (
              <li key={title} className="rounded-xl border border-dashed border-border bg-surface-muted px-3.5 py-3 text-sm font-medium text-ink">
                {title}
                <span className="block text-[11px] font-normal text-ink-muted">Coming soon</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
