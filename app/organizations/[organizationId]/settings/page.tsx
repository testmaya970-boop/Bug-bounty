import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { ToneBadge, TONE } from "../../../../components/ui/badge";
import { LocalTime } from "../../../../components/ui/local-time";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { PageSummary } from "../../../../components/ui/page-summary";
import { OrganizationSettingsForm } from "../../../../components/organizations/settings/organization-settings-form";
import { getOrganizationLogoVersion } from "../../../../services/organization-logos";
import { canManageMembers } from "../../../../services/authorization";
import { getActorMembership, listOrganizationMembers } from "../../../../services/organization-members";
import { getOrganizationSettings, listCurrentUserOrganizations } from "../../../../services/organizations";
import { getSubscription } from "../../../../services/managed-triage";
import { getCurrentUser } from "../../../../lib/auth/current-user";

/**
 * Organization settings: only what applies to the whole workspace. Members, integrations,
 * billing, audit, trust and branding each have their own page. Sections whose backend does
 * not exist yet say Coming soon rather than showing controls that do nothing.
 */
const SECTIONS = [
  ["general", "General"],
  ["regional", "Regional settings"],
  ["program-defaults", "Program defaults"],
  ["researcher-defaults", "Researcher defaults"],
  ["notifications", "Notifications"],
  ["features", "Feature flags"],
  ["developer", "API and developer"],
  ["data", "Data management"],
  ["privacy", "Privacy"],
  ["advanced", "Advanced"],
  ["danger", "Danger zone"],
] as const;

type Row = { label: string; detail: string; status: "on" | "soon" | "link"; href?: string; action?: string };

function Panel({ id, title, description, rows, tone = "default" }: { id: string; title: string; description: string; rows: Row[]; tone?: "default" | "muted" | "danger" }) {
  const frame = tone === "danger" ? "border-[#FECDCA] bg-[#FFFBFA]" : tone === "muted" ? "border-border bg-surface-muted" : "border-border bg-surface";
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={`scroll-mt-24 rounded-2xl border p-5 shadow-sm sm:p-6 ${frame}`}>
      <h2 id={`${id}-heading`} className={`text-base font-semibold ${tone === "danger" ? "text-[#B42318]" : "text-ink"}`}>{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{description}</p>
      <ul className="mt-4 divide-y divide-border">
        {rows.map((r) => (
          <li key={r.label} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{r.label}</span>
              <span className="block text-[13px] text-ink-muted">{r.detail}</span>
            </span>
            {r.status === "soon" ? (
              <ToneBadge tone={TONE.muted}>Coming soon</ToneBadge>
            ) : r.status === "on" ? (
              <ToneBadge tone={TONE.success}>{r.action ?? "Enabled"}</ToneBadge>
            ) : (
              <Link prefetch={false} href={r.href as Route} className={`shrink-0 text-sm font-medium hover:underline ${tone === "danger" ? "text-[#B42318]" : "text-action"}`}>{r.action ?? "Open"}</Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function OrganizationSettingsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/settings` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active") {
    return (
      <AppShell title="Settings" user={user} organizationId={organizationId}>
        <PermissionDenied>You do not have access to this organization.</PermissionDenied>
      </AppShell>
    );
  }
  const canEdit = canManageMembers(actor.role);
  const base = `/organizations/${organizationId}`;

  const [organizations, members, settings, triage, logoVersion] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listOrganizationMembers(organizationId),
    getOrganizationSettings(organizationId),
    canEdit ? getSubscription(organizationId).catch(() => null) : Promise.resolve(null),
    getOrganizationLogoVersion(organizationId),
  ]);
  const organization = organizations.find((org) => org.id === organizationId);
  const name = organization?.name ?? "Organization";
  const owners = members.filter((m) => m.role === "owner" && m.status === "active");
  const { updatedAt, updatedByName, ...initial } = settings;

  return (
    <AppShell titleIsSection title="Settings" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: name, href: base }, { label: "Settings" }]} />
        <OrganizationHeader title="Settings" organizationName={name} organizationId={organizationId} logoVersion={logoVersion} />

        <PageSummary
          description="Configure organization-wide defaults and operational preferences. Members, integrations, billing, trust and branding each have their own page."
          badges={[{ label: canEdit ? "You can edit" : "View only", tone: canEdit ? "info" : "neutral" }]}
          metrics={[
            { label: "Organization", value: name, detail: organization?.slug ? `Workspace slug: ${organization.slug}` : undefined },
            { label: "Owner", value: owners[0]?.displayName ?? "--", detail: owners.length > 1 ? `and ${owners.length - 1} more` : "Workspace owner" },
            { label: "Managed Triage", value: triage?.status === "active" ? "Active" : "Off", detail: triage?.status === "active" ? "Analysts on your queue" : "Not subscribed" },
            { label: "Last updated", value: updatedAt ? new Date(updatedAt).toISOString().slice(0, 10) : "Never", detail: updatedByName ? `by ${updatedByName}` : "Platform defaults in use" },
          ]}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
            <ul className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
              {SECTIONS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className={`block rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface-hover ${id === "danger" ? "text-[#B42318]" : "text-ink-muted hover:text-ink"} max-lg:border max-lg:border-border max-lg:bg-surface`}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-6">
            <OrganizationSettingsForm organizationId={organizationId} organizationName={name} initial={initial} canEdit={canEdit} />

            <Panel id="notifications" title="Notifications" description="Who hears about what. Each member picks their own alerts; channels for the whole team live in Integrations." rows={[
              { label: "Your alerts", detail: "Email and in-app alerts for reports, payments and invitations.", status: "link", href: "/settings/notifications", action: "Open" },
              { label: "Team channels", detail: "Slack, Teams and webhooks for new reports, critical findings and SLA breaches.", status: "link", href: `${base}/integrations`, action: "Open" },
              { label: "Organization digest", detail: "A weekly summary for every member.", status: "soon" },
              { label: "Organization announcements", detail: "Messages from admins to every member.", status: "soon" },
            ]} />

            <Panel id="features" title="Feature flags" description="What this organization can use." rows={[
              { label: "Private programs", detail: "Invite-only engagements.", status: "on" },
              { label: "Public programs", detail: "Listed for every researcher after Unpatched reviews them.", status: "on" },
              { label: "Vulnerability disclosure programs", detail: "Programs without bounties.", status: "on" },
              { label: "Advanced analytics", detail: "Explorer, CSV, XLSX and PDF exports.", status: "on" },
              { label: "Managed Triage", detail: "Unpatched analysts triage your reports.", status: "link", href: `${base}/managed-triage`, action: triage?.status === "active" ? "Active" : "Set up" },
              { label: "AI features", detail: "AI-assisted triage and reporting.", status: "soon" },
              { label: "Beta features", detail: "Early access to new capabilities.", status: "soon" },
            ]} />

            <Panel id="developer" title="API and developer" description="Organization-wide developer behaviour. Connections to other tools are in Integrations." rows={[
              { label: "Webhook defaults", detail: "Signed event delivery, retried with backoff.", status: "link", href: `${base}/integrations/webhooks`, action: "Open" },
              { label: "Organization API keys", detail: "Keys that act for the organization, not a person.", status: "soon" },
              { label: "Allowed origins and rate limits", detail: "Limit where and how often the API is called.", status: "soon" },
            ]} />

            <Panel id="data" title="Data management" description="Getting your data out, and how long it is kept." rows={[
              { label: "Export reports and metrics", detail: "CSV, XLSX or PDF, now or on a weekly or monthly schedule.", status: "link", href: `${base}/analytics`, action: "Open" },
              { label: "Retention policy", detail: "Delete closed reports after a set time.", status: "soon" },
              { label: "Legal hold", detail: "Keep everything while a matter is open.", status: "soon" },
            ]} />

            <Panel id="privacy" title="Privacy" description="What researchers and the public can see about your organization." rows={[
              { label: "Program visibility", detail: "Private programs are hidden from everyone who isn't invited.", status: "on", action: "Applied" },
              { label: "Report disclosure", detail: "Follows the disclosure policy each program publishes.", status: "on", action: "Applied" },
              { label: "Organization privacy controls", detail: "Fine-grained choices for what is shared.", status: "soon" },
            ]} />

            <section id="advanced" aria-labelledby="advanced-heading" className="scroll-mt-24 rounded-2xl border border-border bg-surface-muted p-5 sm:p-6">
              <h2 id="advanced-heading" className="text-base font-semibold text-ink">Advanced</h2>
              <p className="mt-1 text-sm text-ink-muted">Identifiers support may ask for. Nothing here changes how the workspace behaves.</p>
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0"><dt className="text-[12px] text-ink-muted">Organization ID</dt><dd className="break-all font-mono text-[13px] text-ink">{organizationId}</dd></div>
                <div className="min-w-0"><dt className="text-[12px] text-ink-muted">Workspace slug</dt><dd className="break-all font-mono text-[13px] text-ink">{organization?.slug ?? "--"}</dd></div>
                {updatedAt && <div className="min-w-0"><dt className="text-[12px] text-ink-muted">Settings last changed</dt><dd className="text-[13px] text-ink"><LocalTime value={updatedAt} /></dd></div>}
              </dl>
            </section>

            <Panel id="danger" tone="danger" title="Danger zone" description="Actions that are hard to undo. Each one asks you to confirm." rows={[
              { label: "Transfer ownership", detail: "Make another member an owner, then step down. An organization always keeps at least one owner.", status: "link", href: `${base}/members`, action: "Go to Members" },
              { label: "Archive organization", detail: "Close every program and stop new reports.", status: "soon" },
              { label: "Delete organization", detail: "Permanently remove the organization. Contact Unpatched to request this today.", status: "link", href: "/contact", action: "Contact Unpatched" },
            ]} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
