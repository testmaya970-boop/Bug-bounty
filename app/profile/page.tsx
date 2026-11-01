import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { SectionLabel } from "../../components/ui/security-primitives";
import { ExternalProfileLinks } from "../../components/researchers/external-profile-links";
import { getCurrentUser } from "../../lib/auth/current-user";
import { getSettingsAudience } from "../../lib/auth/account-type";
import { getMyBiography, getMyExternalHandles, getMyProfessionalDetails } from "../../services/researcher-profiles";
import { getMyPublicUsername, getPublicResearcherProfile } from "../../services/reputation";
import { listCurrentUserOrganizations } from "../../services/organizations";
import { focusAreaLabel, securityFocusLabel } from "../../lib/researcher-identity-labels";

/**
 * /profile: who you are on Unpatched -- the identity side of the account, as others see it.
 * /settings is the private side (sign-in, security, notifications, payouts). This page only
 * shows what is already public or shown to the programs you work with (name, username,
 * biography, focus areas, the external profiles you listed, your public standing), never an
 * email address, KYC or payout detail. Editing happens in the matching settings form.
 */
const linkClass = "font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const buttonClass =
  "inline-flex min-h-10 items-center rounded-md border border-border-strong bg-surface px-3.5 text-sm font-semibold text-ink transition-[transform,background-color] duration-150 ease-out hover:bg-surface-hover active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/profile" as Route);
  const audience = await getSettingsAudience();

  if (audience !== "researcher") {
    const organizations = await listCurrentUserOrganizations(user.id);
    return (
      <AppShell title="Profile" user={user}>
        <div className="max-w-2xl space-y-8">
          <header>
            <h2 className="text-2xl font-semibold tracking-tight">{user.displayName}</h2>
            <p className="mt-1 text-sm text-ink-muted">{audience === "organization" ? "Organization account" : "Platform staff"}</p>
          </header>
          {organizations.length > 0 && (
            <section>
              <SectionLabel>Organizations</SectionLabel>
              <ul className="mt-2 divide-y divide-border border-y border-border">
                {organizations.map((org) => (
                  <li key={org.id} className="py-3 text-sm">
                    <Link prefetch={false} href={`/organizations/${org.id}` as Route} className={linkClass}>
                      {org.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Link prefetch={false} href={"/settings/profile" as Route} className={buttonClass}>
            Edit profile
          </Link>
        </div>
      </AppShell>
    );
  }

  const [publicUsername, biography, professional, external] = await Promise.all([
    getMyPublicUsername(user.id),
    getMyBiography(user.id),
    getMyProfessionalDetails(user.id),
    getMyExternalHandles(user.id),
  ]);
  const standing = publicUsername ? await getPublicResearcherProfile(publicUsername) : null;
  const focus = [...(professional?.hackingInterests ?? []).map(focusAreaLabel), ...(professional?.securityFocus ?? []).map(securityFocusLabel)];
  const hasExternal = Object.entries(external).some(([key, value]) => key !== "showExternalLinks" && Boolean(value));

  return (
    <AppShell title="Profile" user={user}>
      <div className="max-w-3xl space-y-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight">{user.displayName}</h2>
            {publicUsername ? (
              <p className="mt-1 font-mono text-sm text-ink-muted">@{publicUsername}</p>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">No public username yet, so you have no public profile page.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {publicUsername && (
              <Link prefetch={false} href={`/researchers/${publicUsername}` as Route} className={buttonClass}>
                View public page
              </Link>
            )}
            <Link prefetch={false} href={"/settings/profile" as Route} className={buttonClass}>
              Edit profile
            </Link>
          </div>
        </header>

        {standing && (
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Public standing">
            {[
              ["Reputation score", standing.score],
              ["Resolved reports", standing.resolvedCount],
              ["Bounties earned", standing.bountyFinalizedCount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-surface p-4">
                <SectionLabel>{label}</SectionLabel>
                <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{Number(value).toLocaleString("en-US")}</p>
              </div>
            ))}
          </section>
        )}

        <section>
          <SectionLabel>About</SectionLabel>
          {biography ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{biography}</p>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">
              No biography yet.{" "}
              <Link prefetch={false} href={"/settings/profile" as Route} className={linkClass}>
                Add one
              </Link>
            </p>
          )}
        </section>

        <section>
          <SectionLabel>Focus areas</SectionLabel>
          {focus.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {focus.map((label) => (
                <span key={label} className="rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-ink-muted">
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">
              None listed.{" "}
              <Link prefetch={false} href={"/settings/skills" as Route} className={linkClass}>
                Add skills and interests
              </Link>
            </p>
          )}
        </section>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionLabel>External profiles</SectionLabel>
            <Link prefetch={false} href={"/settings/external-services" as Route} className={`text-sm ${linkClass}`}>
              {hasExternal ? "Edit" : "Add profiles"}
            </Link>
          </div>
          {hasExternal ? (
            <>
              <p className="mt-1 text-xs text-ink-muted">
                Self-reported. {external.showExternalLinks && publicUsername ? "Shown on your public profile." : "Only you can see these until you choose to show them on your public profile."}
              </p>
              <ExternalProfileLinks handles={external} />
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">Add your HackerOne, Bugcrowd, GitHub and other profiles so programs can see your wider track record.</p>
          )}
          {professional?.linkedinUrl && (
            <p className="mt-3 text-sm">
              <a href={professional.linkedinUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className={linkClass}>
                LinkedIn
              </a>
              <span className="text-ink-muted"> (shown to programs you research for)</span>
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
