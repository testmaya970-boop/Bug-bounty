import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { CalendarClock, Clock, Copy, Repeat, ShieldAlert, Webhook, type LucideIcon } from "lucide-react";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../components/ui/feedback";
import { ToneBadge, TONE } from "../../../../components/ui/badge";
import { OrganizationHeader } from "../../../../components/organizations/organization-header";
import { PageSummary } from "../../../../components/ui/page-summary";
import { getOrganizationLogoVersion } from "../../../../services/organization-logos";
import { canManageMembers } from "../../../../services/authorization";
import { getActorMembership } from "../../../../services/organization-members";
import { listCurrentUserOrganizations } from "../../../../services/organizations";
import { listExportSchedules } from "../../../../services/analytics-explorer";
import { listWebhookEndpoints } from "../../../../services/org-integrations";
import { getSubscription } from "../../../../services/managed-triage";
import { getCurrentUser } from "../../../../lib/auth/current-user";

type Rule = { title: string; icon: LucideIcon; body: string; status: string; on: boolean; href?: string };

const COMING_SOON = ["Workflow builder", "Auto-assign reports to triagers", "Escalate overdue critical reports", "Custom triggers and actions"];

/** Automation: what Unpatched already does on its own, and where each is set up. */
export default async function OrganizationAutomationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/automation` as Route);

  const actor = await getActorMembership(user.id, organizationId);
  if (!actor || actor.status !== "active" || !canManageMembers(actor.role)) {
    return (
      <AppShell title="Automation" user={user} organizationId={organizationId}>
        <PermissionDenied>Only an owner or security admin can see this organization&apos;s automation.</PermissionDenied>
      </AppShell>
    );
  }

  const base = `/organizations/${organizationId}`;
  const [organizations, schedules, hooks, triage, logoVersion] = await Promise.all([
    listCurrentUserOrganizations(user.id),
    listExportSchedules(organizationId).catch(() => []),
    listWebhookEndpoints(organizationId).catch(() => []),
    getSubscription(organizationId).catch(() => null),
    getOrganizationLogoVersion(organizationId),
  ]);
  const name = organizations.find((org) => org.id === organizationId)?.name ?? "Organization";
  const activeHooks = hooks.filter((h) => h.status === "active").length;
  const triageOn = triage?.status === "active";

  const rules: Rule[] = [
    { title: "SLA timers", icon: Clock, body: "Every report is timed against its program's first-response, triage and resolution targets.", status: "Always on", on: true, href: `${base}/programs` },
    { title: "Duplicate detection", icon: Copy, body: "New reports are compared with earlier ones on the same program and likely duplicates are suggested to triage.", status: "Always on", on: true },
    { title: "Submission cooldown", icon: ShieldAlert, body: "Researchers whose reports keep closing as invalid are paused for a while, so your queue stays clean.", status: "Always on", on: true },
    { title: "Scheduled exports", icon: CalendarClock, body: "Analytics exports sent weekly or monthly.", status: schedules.length ? `${schedules.length} scheduled` : "None scheduled", on: schedules.length > 0, href: `${base}/analytics` },
    { title: "Webhook delivery", icon: Webhook, body: "Events are signed and retried with backoff until your endpoint accepts them.", status: hooks.length ? `${activeHooks} of ${hooks.length} active` : "Not set up", on: activeHooks > 0, href: `${base}/integrations/webhooks` },
    { title: "Managed Triage renewal", icon: Repeat, body: "The monthly plan renews from your prepaid balance and pauses if the balance can't cover it.", status: triageOn ? "Renewing monthly" : "Not subscribed", on: triageOn, href: `${base}/managed-triage` },
  ];
  const running = rules.filter((r) => r.on).length;

  return (
    <AppShell titleIsSection title="Automation" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: name, href: base }, { label: "Automation" }]} />
        <OrganizationHeader title="Automation" organizationName={name} organizationId={organizationId} logoVersion={logoVersion} />

        <PageSummary
          description="What Unpatched does for you without anyone clicking. Each one is configured on its own page."
          metrics={[
            { label: "Running now", value: `${running} of ${rules.length}`, detail: "Automations on for this organization" },
            { label: "Scheduled exports", value: String(schedules.length), detail: schedules.length ? "Sent automatically" : "None yet" },
            { label: "Active webhooks", value: String(activeHooks), detail: `${hooks.length} configured` },
            { label: "Managed Triage", value: triageOn ? "On" : "Off", detail: triageOn ? "Analysts working your queue" : "Not subscribed", tone: triageOn ? "success" : "neutral" },
          ]}
        />

        <section aria-labelledby="rules-heading" className="space-y-3">
          <h2 id="rules-heading" className="text-base font-semibold text-ink">What runs automatically</h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rules.map((r) => (
              <li key={r.title} className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2.5">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-ink"><r.icon aria-hidden className="size-4" /></span>
                    <span className="font-semibold text-ink">{r.title}</span>
                  </span>
                  <ToneBadge tone={r.on ? TONE.success : TONE.muted}>{r.status}</ToneBadge>
                </div>
                <p className="mt-3 flex-1 text-sm text-ink-muted">{r.body}</p>
                {r.href && (
                  <Link prefetch={false} href={r.href as Route} className="mt-3 text-sm font-medium text-action hover:underline">Set up</Link>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="auto-soon-heading" className="space-y-3">
          <h2 id="auto-soon-heading" className="text-base font-semibold text-ink">Coming soon</h2>
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
