import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { RegistryList, SectionLabel } from "../../../components/ui/security-primitives";
import { ProfileSettings } from "../../../components/settings/profile-settings";
import { listCurrentUserOrganizations } from "../../../services/organizations";
import { getMyBiography } from "../../../services/researcher-profiles";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { getSettingsAudience } from "../../../lib/auth/account-type";

export default async function PublicProfileSettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null; // layout already redirects; this satisfies the type only.

  // Organization accounts and platform admins have no biography or public researcher profile.
  const audience = await getSettingsAudience();
  const isOrganization = audience === "organization";
  const isResearcher = audience === "researcher";
  const [biography, organizations] = await Promise.all([
    isResearcher ? getMyBiography(user.id) : null,
    listCurrentUserOrganizations(user.id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{isResearcher ? "Public Profile" : "Profile"}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {isOrganization ? "How you appear to your team and to the researchers you work with." : isResearcher ? "Shown on your reports and to organizations you research for." : "How you appear to other platform staff and in audit records."}
        </p>
      </div>

      <ProfileSettings initialDisplayName={user.displayName} initialBiography={biography ?? ""} researcherFields={isResearcher} />

      {organizations.length > 0 && (
        <div className="border-t border-border pt-6">
          <SectionLabel>Organization</SectionLabel>
          {organizations.length === 1 ? (
            <p className="mt-2 text-sm text-ink-muted">
              <Link prefetch={false} href={`/organizations/${organizations[0].id}/settings` as Route} className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                Configure {organizations[0].name} →
              </Link>
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-ink-muted">You belong to more than one organization. Choose one to configure.</p>
              <RegistryList>
                {organizations.map((organization) => (
                  <li key={organization.id}>
                    <Link prefetch={false}
                      href={`/organizations/${organization.id}/settings` as Route}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:px-5"
                    >
                      <span className="font-medium text-ink">{organization.name}</span>
                      <span className="text-sm text-ink-muted">Settings →</span>
                    </Link>
                  </li>
                ))}
              </RegistryList>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
