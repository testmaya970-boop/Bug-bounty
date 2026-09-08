import { describe, expect, it } from "vitest";
import { describeOrganizationActivity } from "../../lib/organization-activity-labels";
import type { OrganizationAuditEventRecord } from "../../types/organization";

function makeEvent(overrides: Partial<OrganizationAuditEventRecord>): OrganizationAuditEventRecord {
  return {
    id: "event-1",
    actorId: "user-1",
    action: "member.invited",
    entityType: "organization_invitation",
    entityId: "invite-1",
    metadata: {},
    createdAt: "2026-09-06T00:00:00Z",
    ...overrides,
  };
}

describe("describeOrganizationActivity: a real, cross-entity activity feed for Home -- covers the full audit_logs action vocabulary, not just member.* actions", () => {
  it("attributes a human action to the resolved actor name", () => {
    const { title } = describeOrganizationActivity(makeEvent({ action: "member.invited" }), "Riley Owner");
    expect(title).toBe("Riley Owner invited a member");
  });

  it("attributes a system event (actorId null) to 'System event', never a fabricated actor", () => {
    const { title } = describeOrganizationActivity(makeEvent({ action: "organization.created", actorId: null }), "Riley Owner");
    expect(title).toBe("System event: created this organization");
  });

  it("describes real report-lifecycle actions -- not just the narrow member.* set member-activity.tsx's own ACTION_LABELS covers", () => {
    const actions: [string, string][] = [
      ["report.created", "submitted a report"],
      ["report.triage_started", "started triage"],
      ["report.accepted", "accepted a report"],
      ["report.resolved", "resolved a report"],
      ["report.rejected", "rejected a report"],
      ["scope.asset_added", "added a scope asset"],
      ["bounty.finalized", "finalized a bounty"],
    ];
    for (const [action, expectedLabel] of actions) {
      const { title } = describeOrganizationActivity(makeEvent({ action }), "Riley Owner");
      expect(title).toBe(`Riley Owner ${expectedLabel}`);
    }
  });

  it("falls back to the raw action string for an action not yet in the label map, rather than dropping the event", () => {
    const { title } = describeOrganizationActivity(makeEvent({ action: "some.future.action" }), "Riley Owner");
    expect(title).toBe("Riley Owner some.future.action");
  });

  it("shows the previous -> new role transition as detail for a role change", () => {
    const { detail } = describeOrganizationActivity(makeEvent({ action: "member.role_changed", metadata: { previous_role: "triager", new_role: "security_admin" } }), "Riley Owner");
    expect(detail).toBe("triager → security_admin");
  });

  it("shows the invited email as detail for an invite/cancel event", () => {
    const { detail } = describeOrganizationActivity(makeEvent({ action: "member.invited", metadata: { email: "new@example.test" } }), "Riley Owner");
    expect(detail).toBe("new@example.test");
  });

  it("shows the confirmed severity as detail for a severity-set event", () => {
    const { detail } = describeOrganizationActivity(makeEvent({ action: "report.severity_set", metadata: { new_severity: "critical" } }), "Riley Owner");
    expect(detail).toBe("Severity: critical");
  });

  it("formats a real minor-units amount as a decimal currency detail for a finalized bounty, never a fabricated total", () => {
    const { detail } = describeOrganizationActivity(makeEvent({ action: "bounty.finalized", metadata: { amount_minor_units: 150000, currency: "USD" } }), "Riley Owner");
    expect(detail).toBe("USD 1500.00");
  });

  it("returns an empty detail for an action with no relevant metadata, rather than a fabricated placeholder", () => {
    const { detail } = describeOrganizationActivity(makeEvent({ action: "report.evidence_downloaded" }), "Riley Owner");
    expect(detail).toBe("");
  });
});
