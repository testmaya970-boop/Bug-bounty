import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { ToneBadge, TONE } from "../../../../components/ui/badge";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { PageSummary, type SummaryBadge } from "../../../../components/ui/page-summary";
import { VerifiedDomainsSettings } from "../../../../components/organizations/verified-domains-settings";
import { getOrganizationLogoVersion } from "../../../../services/organization-logos";
import { canManageMembers } from "../../../../services/authorization";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listOrganizationDomains } from "../../../../services/organization-domains";
import { listProgramsForOrganization } from "../../../../services/programs";
import { listActiveScopeEntries } from "../../../../services/scope";
import { getSsoConnection } from "../../../../services/sso";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import type { ScopeClearance } from "../../../../types/scope";

const WAITING: Partial<Record<ScopeClearance, { label: string; tone: (typeof TONE)[keyof typeof TONE] }>> = {
  pending_verification: { label: "Verify the domain", tone: TONE.warning },
  pending_review: { label: "Unpatched is reviewing", tone: TONE.warning },
  rejected: { label: "Ownership not confirmed", tone: TONE.danger },
};

/** Trust: proof that the organization owns what it asks researchers to test. */
export default async function OrganizationTrustPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/trust` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Trust" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }

  // Any member can see ownership status; only owners and security admins change domains.
  const canManage = canManageMembers(actor.role);
  const [organizations, domains, programs, sso, logoVersion] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listOrganizationDomains(organizationId),
    listProgramsForOrganization(organizationId),
    canManage ? getSsoConnection(organizationId).catch(() => null) : Promise.resolve(null),
    getOrganizationLogoVersion(organizationId),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);
  const live = programs.filter((p) => p.status !== "closed");
  // ponytail: one scope read per open program; an org-wide clearance RPC if programs grow past dozens.
  const scope = (await Promise.all(live.map(async (p) => (await listActiveScopeEntries(p.id)).map((entry) => ({ entry, program: p }))))).flat();
  const waiting = scope.filter(({ entry }) => WAITING[entry.clearance ?? "not_required"]);
  const cleared = scope.filter(({ entry }) => entry.clearance === "verified" || entry.clearance === "approved" || entry.clearance === "not_required").length;
  const verified = domains.filter((d) => d.status === "verified").length;
  const pending = domains.length - verified;

  const badges: SummaryBadge[] = [
    verified > 0 ? { label: `${verified} verified ${verified === 1 ? "domain" : "domains"}`, tone: "success" } : { label: "No verified domain", tone: "warning" },
    sso?.status === "active" ? { label: sso.enforced ? "SSO required" : "SSO on", tone: "info" } : { label: "SSO not on", tone: "neutral" },
  ];

  return (
    <AppShell titleIsSection title="Trust" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: organization?.name ?? "Organization", href: `/organizations/${organizationId}` }, { label: "Trust" }]} />
        <OrganizationHeader title="Trust" organizationName={organization?.name ?? "Organization"} organizationId={organizationId} logoVersion={logoVersion} />

        <PageSummary
          description="Researchers only test what you have proved you own. Hosts under a verified domain become testable at once; anything else waits for Unpatched to confirm ownership."
          badges={badges}
          metrics={[
            { label: "Verified domains", value: String(verified), detail: pending > 0 ? `${pending} waiting for the DNS record` : "None waiting", tone: pending > 0 ? "warning" : "neutral" },
            { label: "Scope cleared", value: String(cleared), detail: `of ${scope.length} in-scope ${scope.length === 1 ? "entry" : "entries"}` },
            { label: "Waiting on ownership", value: String(waiting.length), detail: waiting.length > 0 ? "Hidden from researchers" : "Nothing waiting", tone: waiting.length > 0 ? "warning" : "success" },
            { label: "Single sign-on", value: sso?.status === "active" ? "On" : "Off", detail: sso?.status === "active" ? (sso.enforced ? "Required for members" : "Optional for members") : "Not set up" },
          ]}
        />

        <section id="verified-domains" aria-labelledby="domains-heading" className="scroll-mt-20 rounded-2xl border border-border bg-surface p-5">
          <h2 id="domains-heading" className="text-base font-semibold text-ink">Verified domains</h2>
          <p className="mt-1 text-sm text-ink-muted">Prove you control a domain before researchers may test it. Hosts under a verified domain become testable; anything else you add to scope stays hidden until it is verified.</p>
          <div className="mt-4">
            <VerifiedDomainsSettings organizationId={organizationId} domains={domains} canManage={canManage} />
          </div>
        </section>

        <section aria-labelledby="waiting-heading" className="rounded-2xl border border-border bg-surface p-5">
          <h2 id="waiting-heading" className="text-base font-semibold text-ink">Scope waiting on ownership</h2>
          {waiting.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Every in-scope entry is cleared for testing.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {waiting.map(({ entry, program }) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <span className="block break-all font-mono text-[13px] text-ink">{entry.displayTarget}</span>
                    <Link prefetch={false} href={`/organizations/${organizationId}/programs/${program.id}#scope` as Route} className="text-xs text-action hover:underline">{program.name}</Link>
                  </span>
                  <ToneBadge tone={WAITING[entry.clearance ?? "not_required"]!.tone}>{WAITING[entry.clearance ?? "not_required"]!.label}</ToneBadge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="trust-soon-heading" className="space-y-3">
          <h2 id="trust-soon-heading" className="text-base font-semibold text-ink">Coming soon</h2>
          <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {["Public trust page for researchers", "Compliance attestations", "Scheduled re-verification of domains"].map((title) => (
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
