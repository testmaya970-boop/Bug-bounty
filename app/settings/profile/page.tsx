import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { RegistryList, SectionLabel } from "../../../components/ui/security-primitives";
import { ProfileSettings } from "../../../components/settings/profile-settings";
import { listCurrentUserOrganizations } from "../../../services/organizations";
import { getMyBiography } from "../../../services/researcher-profiles";
import { getMyPublicUsername } from "../../../services/reputation";
import { getCurrentUser } from "../../../lib/auth/current-user";

export default async function PublicProfileSettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null; // layout already redirects; this satisfies the type only.

  const [biography, publicUsername, organizations] = await Promise.all([getMyBiography(user.id), getMyPublicUsername(user.id), listCurrentUserOrganizations(user.id)]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Public Profile</h1>
        <p className="mt-1 text-sm text-ink-muted">Shown on your reports and to organizations you research for.</p>
      </div>

      <ProfileSettings initialDisplayName={user.displayName} initialBiography={biography ?? ""} initialPublicUsername={publicUsername} />

      {organizations.length > 0 && (
        <div className="border-t border-border pt-6">
          <SectionLabel>Organization</SectionLabel>
          {organizations.length === 1 ? (
            <p className="mt-2 text-sm text-ink-muted">
              <Link href={`/organizations/${organizations[0].id}/settings` as Route} className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                Configure {organizations[0].name} →
              </Link>
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-ink-muted">You belong to more than one organization. Choose one to configure.</p>
              <RegistryList>
                {organizations.map((organization) => (
                  <li key={organization.id}>
                    <Link
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
