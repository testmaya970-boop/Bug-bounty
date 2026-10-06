import type { OrganizationAuditEventRecord } from "@/types/organization";

/**
 * Every real `audit_logs.action` value written anywhere in this schema -- confirmed by a
 * complete, untruncated extraction of every `insert into public.audit_logs(...)`
 * statement across supabase/migrations (`grep -rzoP "insert into public\.audit_logs[^;]*;"`,
 * matching each full statement rather than a fixed line window, so a multi-line `values(...)`
 * call can't be silently missed the way an earlier, narrower pass here was). Unlike
 * components/organizations/member-activity.tsx's own ACTION_LABELS, which only covers the
 * 7 member.* actions relevant to the Members page, this covers the full real vocabulary
 * (program.*, report.*, bounty.*, payment.*, payout.*, scope.*, kyc.*,
 * report_disclosure.*, researcher.*, notification_preference.*, platform.*,
 * platform_admin.*, organization.created) for a genuine cross-entity "recent
 * organization activity" feed on Home.
 *
 * The platform.* and platform_admin.* actions are recorded by platform-admin operations (see
 * services/platform-operations.ts) -- included here for completeness/correctness (an org
 * whose own admin action happens to also touch a platform-level flag should still read
 * correctly), even though most organizations will rarely if ever see one in their own feed.
 *
 * An action not yet in this map falls back to the raw action string, never a silent drop
 * -- confirmed live: `researcher.invited`/`researcher.invitation_accepted` rendered as raw
 * strings before this file's first pass included them, proving the fallback path is real
 * and exercised, not theoretical.
 */
const ACTION_LABELS: Record<string, string> = {
  "organization.created": "created this organization",
  "organization.description_updated": "updated the organization description",

  "program.created": "created a program",
  "program.description_updated": "updated a program's description",
  "program.access_instructions_updated": "updated a program's access instructions",
  "program.policy_published": "published a program policy version",
  "program.visibility_changed": "changed a program's visibility",
  "program.focus_areas_updated": "updated a program's focus areas",
  "program.kyc_requirement_set": "changed a program's identity verification requirement",
  "program.bounty_policy_created": "updated a program's bounty policy",
  "program.submitted_for_review": "submitted a program for review",
  "program.activated": "activated a program",
  "program.paused": "paused a program",
  "program.resumed": "resumed a program",
  "program.closed": "closed a program",

  "member.invited": "invited a member",
  "member.invitation_accepted": "accepted an invitation",
  "member.invitation_cancelled": "cancelled an invitation",
  "member.role_changed": "changed a member's role",
  "member.suspended": "suspended a member",
  "member.reactivated": "reactivated a member",
  "member.removed": "removed a member",

  "researcher.invited": "invited a researcher",
  "researcher.invitation_accepted": "accepted a researcher invitation",
  "researcher.invitation_cancelled": "cancelled a researcher invitation",
  "researcher.joined_public_program": "joined a public program",
  "researcher.suspended": "suspended a researcher",
  "researcher.reinstated": "reinstated a researcher",
  "researcher.revoked": "revoked a researcher",

  "scope.asset_added": "added a scope asset",
  "scope.asset_updated": "updated a scope asset",
  "scope.asset_removed": "removed a scope asset",

  "report.created": "submitted a report",
  "report.triage_started": "started triage",
  "report.information_requested": "requested more information",
  "report.researcher_responded": "responded with the requested information",
  "report.accepted": "accepted a report",
  "report.marked_duplicate": "marked a report as a duplicate",
  "report.marked_informative": "marked a report informative",
  "report.marked_not_applicable": "marked a report not applicable",
  "report.rejected": "rejected a report",
  "report.resolved": "resolved a report",
  "report.severity_set": "set a report's severity",
  "report.message_posted": "posted a message",
  "report.evidence_added": "added evidence",
  "report.evidence_downloaded": "downloaded evidence",
  "report.collaborator_added": "added a report collaborator",
  "report.collaborator_removed": "removed a report collaborator",
  "report.retest_requested": "requested a retest",
  "report.retest_decided": "decided a retest",
  "report.retest_escalated": "escalated a retest",
  "report.assigned": "assigned a report",
  "report.unassigned": "unassigned a report",
  "report.reopened": "reopened a report after a failed retest",
  "report.mediation_opened": "opened mediation",
  "report.mediation_resolved": "resolved mediation",
  "report.mediation_escalated": "escalated mediation",

  "report_disclosure.draft_updated": "edited a disclosure write-up",
  "report_disclosure.unpublished": "unpublished a disclosed report",
  "report_disclosure.requested": "requested public disclosure",
  "report_disclosure.approved": "approved public disclosure",
  "report_disclosure.declined": "declined public disclosure",

  "bounty.calculated": "calculated a bounty",
  "bounty.adjusted": "adjusted a bounty",
  "bounty.finalized": "finalized a bounty",
  "bounty.policy_version_created": "updated the bounty policy",

  "bounty.accepted": "confirmed a bounty award",
  "payout.tax_form_reviewed": "reviewed a tax form",
  "payment.obligation_created": "created a payment obligation",
  "payment.initiated": "initiated a payment",
  "payment.succeeded": "completed a payment",
  "payment.failed": "recorded a failed payment",
  "payment.cancelled": "cancelled a payment",
  "payout.tax_form_submitted": "submitted a tax form",

  "kyc.field_reviewed": "reviewed an identity verification field",
  "kyc.field_decrypted": "viewed an identity verification field",

  "notification_preference.updated": "updated a notification preference",

  "platform.organization_suspended": "was suspended by Unpatched",
  "platform.organization_reinstated": "was reinstated by Unpatched",
  "platform.program_launch_approved": "had a program launch approved",
  "platform.program_launch_rejected": "had a program launch rejected",
  "platform.researcher_suspended": "had a researcher suspended platform-wide",
  "platform.researcher_reinstated": "had a researcher reinstated platform-wide",
  "platform.retest_resolved": "had an escalated retest resolved",
  "platform.mediation_resolved": "had an escalated mediation resolved",
  "platform.outbox_event_replayed": "had a stuck event replayed",
  "platform_admin.granted": "was granted platform admin access",
  "platform_admin.revoked": "had platform admin access revoked",
};

/** One real audit_logs row, described for a cross-entity activity timeline -- system
 * events (actorId null) read as "System event: ..." per the same convention
 * member-activity.tsx already established, never attributed to a fabricated actor. */
export function describeOrganizationActivity(event: OrganizationAuditEventRecord, actorName: string): { title: string; detail: string } {
  const actionLabel = ACTION_LABELS[event.action] ?? event.action;
  const title = event.actorId ? `${actorName} ${actionLabel}` : `System event: ${actionLabel}`;

  if (event.action === "member.role_changed" && typeof event.metadata.previous_role === "string" && typeof event.metadata.new_role === "string") {
    return { title, detail: `${event.metadata.previous_role} → ${event.metadata.new_role}` };
  }
  if ((event.action === "member.invited" || event.action === "member.invitation_cancelled") && typeof event.metadata.email === "string") {
    return { title, detail: event.metadata.email };
  }
  if (event.action === "report.severity_set" && typeof event.metadata.new_severity === "string") {
    return { title, detail: `Severity: ${event.metadata.new_severity}` };
  }
  if (event.action === "bounty.finalized" && typeof event.metadata.amount_minor_units === "number" && typeof event.metadata.currency === "string") {
    return { title, detail: `${event.metadata.currency} ${(event.metadata.amount_minor_units / 100).toFixed(2)}` };
  }
  return { title, detail: "" };
}
