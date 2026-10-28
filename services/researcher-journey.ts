import "server-only";
import type { PoolClient } from "pg";
import { withActorTransaction, withPublicTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";

// Researcher journey (202610280001, decision 0089): collaboration invitations, CVE requests,
// acknowledgements, events, mentorship, swag, followed programs, agreements and the dashboard
// action summary. Every rule lives in the database functions; this file only calls them.

const iso = (v: string | Date | null): string | null => (v ? new Date(v).toISOString() : null);

/** Runs as the signed-in caller and maps `CODE: message` errors. Call sites keep the literal
 * literal function name and argument array at each call so scripts/check-rpc-call-order.mjs can check them. */
async function asActor<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const actor = await getCurrentUser();
  if (!actor) throw new OrganizationServiceError("Sign in again to continue.", "AUTH_REQUIRED");
  try {
    return await withActorTransaction(actor.id, fn);
  } catch (error) {
    mapError(error as { message: string });
  }
}

// Collaboration -------------------------------------------------------------------------------------
export type Collaboration = {
  kind: "collaborator" | "invitation";
  id: string;
  reportId: string;
  reportTitle: string;
  reportStatus: string;
  programName: string;
  myRole: "submitter" | "collaborator" | "invitee";
  otherDisplayName: string;
  otherUsername: string | null;
  splitPercent: number;
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  createdAt: string;
  editable: boolean;
  /** Link to the report, only when the caller can read it (RLS): never for a pending invitee. */
  reportHref: string | null;
};

export async function listMyCollaborations(): Promise<Collaboration[]> {
  type Row = { kind: Collaboration["kind"]; id: string; report_id: string; report_title: string; report_status: string; program_name: string; my_role: Collaboration["myRole"]; other_display_name: string; other_username: string | null; bounty_split_percent: string; status: Collaboration["status"]; created_at: string; editable: boolean };
  const { rows, readable } = await asActor(async (c) => {
    const rows = await callRpc<Row>(c, "public.list_my_collaborations");
    const ids = [...new Set(rows.map((r) => r.report_id))];
    const readable = await c.query<{ id: string; organization_id: string; program_id: string }>("select id, organization_id, program_id from public.reports where id = any($1::uuid[])", [ids]);
    return { rows, readable: new Map(readable.rows.map((r) => [r.id, `/organizations/${r.organization_id}/programs/${r.program_id}/reports/${r.id}`])) };
  });
  return rows.map((r) => ({ kind: r.kind, id: r.id, reportId: r.report_id, reportTitle: r.report_title, reportStatus: r.report_status, programName: r.program_name, myRole: r.my_role, otherDisplayName: r.other_display_name, otherUsername: r.other_username, splitPercent: Number(r.bounty_split_percent), status: r.status, createdAt: iso(r.created_at)!, editable: r.editable, reportHref: readable.get(r.report_id) ?? null }));
}

export async function inviteReportCollaborator(reportId: string, username: string, splitPercent: number, message: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.invite_report_collaborator", [reportId, username, splitPercent, message || null]));
}

export async function respondCollaborationInvitation(invitationId: string, accept: boolean): Promise<void> {
  await asActor((c) => callRpc(c, "public.respond_collaboration_invitation", [invitationId, accept]));
}

export async function revokeCollaborationInvitation(invitationId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.revoke_collaboration_invitation", [invitationId]));
}

// CVE requests ---------------------------------------------------------------------------------------
export type CveRequest = { id: string; reportId: string; reportTitle: string; programName: string; affectedProduct: string; affectedVersions: string; status: "pending" | "approved" | "rejected" | "withdrawn" | "assigned"; reviewerNote: string | null; cveId: string | null; cveEvidenceUrl: string | null; createdAt: string; reviewedAt: string | null };
export type CveEligibleReport = { reportId: string; reportTitle: string; programName: string; publishedTitle: string | null };

export async function listMyCveRequests(): Promise<CveRequest[]> {
  type Row = { id: string; report_id: string; report_title: string; program_name: string; affected_product: string; affected_versions: string; status: CveRequest["status"]; reviewer_note: string | null; cve_id: string | null; cve_evidence_url: string | null; created_at: string; reviewed_at: string | null };
  const rows = await asActor((c) => callRpc<Row>(c, "public.list_my_cve_requests"));
  return rows.map((r) => ({ id: r.id, reportId: r.report_id, reportTitle: r.report_title, programName: r.program_name, affectedProduct: r.affected_product, affectedVersions: r.affected_versions, status: r.status, reviewerNote: r.reviewer_note, cveId: r.cve_id, cveEvidenceUrl: r.cve_evidence_url, createdAt: iso(r.created_at)!, reviewedAt: iso(r.reviewed_at) }));
}

export async function listMyCveEligibleReports(): Promise<CveEligibleReport[]> {
  type Row = { report_id: string; report_title: string; program_name: string; published_title: string | null };
  const rows = await asActor((c) => callRpc<Row>(c, "public.list_my_cve_eligible_reports"));
  return rows.map((r) => ({ reportId: r.report_id, reportTitle: r.report_title, programName: r.program_name, publishedTitle: r.published_title }));
}

export async function requestCve(reportId: string, product: string, versions: string, justification: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.request_cve", [reportId, product, versions, justification]));
}

export async function withdrawCveRequest(id: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.withdraw_cve_request", [id]));
}

export type CveReviewItem = { id: string; reportId: string; publishedTitle: string | null; organizationName: string; programName: string; requesterUsername: string; affectedProduct: string; affectedVersions: string; justification: string; status: "pending" | "approved"; createdAt: string };

export async function listCveRequestsForReview(): Promise<CveReviewItem[]> {
  type Row = { id: string; report_id: string; published_title: string | null; organization_name: string; program_name: string; requester_username: string; affected_product: string; affected_versions: string; justification: string; status: "pending" | "approved"; created_at: string };
  const rows = await asActor((c) => callRpc<Row>(c, "public.list_cve_requests_for_review"));
  return rows.map((r) => ({ id: r.id, reportId: r.report_id, publishedTitle: r.published_title, organizationName: r.organization_name, programName: r.program_name, requesterUsername: r.requester_username, affectedProduct: r.affected_product, affectedVersions: r.affected_versions, justification: r.justification, status: r.status, createdAt: iso(r.created_at)! }));
}

export async function reviewCveRequest(id: string, decision: "approved" | "rejected", note: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.review_cve_request", [id, decision, note || null]));
}

export async function recordCveAssignment(id: string, cveId: string, evidenceUrl: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.record_cve_assignment", [id, cveId.trim().toUpperCase(), evidenceUrl.trim()]));
}

// Acknowledgements / Hall of Fame ---------------------------------------------------------------------
export type Acknowledgement = { id: string; programId: string; organizationId: string; programName: string; organizationName: string; reportId: string; reportTitle: string; status: "proposed" | "published" | "declined" | "revoked"; note: string | null; createdAt: string; publishedAt: string | null };
export type HallOfFameEntry = { programId: string; organizationId: string; programName: string; organizationName: string; researcherDisplayName: string; researcherUsername: string | null; note: string | null; publishedAt: string };

export async function listMyAcknowledgements(): Promise<Acknowledgement[]> {
  type Row = { id: string; program_id: string; organization_id: string; program_name: string; organization_name: string; report_id: string; report_title: string; status: Acknowledgement["status"]; note: string | null; created_at: string; published_at: string | null };
  const rows = await asActor((c) => callRpc<Row>(c, "public.list_my_acknowledgements"));
  return rows.map((r) => ({ id: r.id, programId: r.program_id, organizationId: r.organization_id, programName: r.program_name, organizationName: r.organization_name, reportId: r.report_id, reportTitle: r.report_title, status: r.status, note: r.note, createdAt: iso(r.created_at)!, publishedAt: iso(r.published_at) }));
}

/** Public: readable signed out. */
export async function listHallOfFame(programId: string | null, limit = 200): Promise<HallOfFameEntry[]> {
  type Row = { program_id: string; organization_id: string; program_name: string; organization_name: string; researcher_display_name: string; researcher_username: string | null; note: string | null; published_at: string };
  const rows = await withPublicTransaction(null, (c) => callRpc<Row>(c, "public.list_hall_of_fame", [programId, limit]));
  return rows.map((r) => ({ programId: r.program_id, organizationId: r.organization_id, programName: r.program_name, organizationName: r.organization_name, researcherDisplayName: r.researcher_display_name, researcherUsername: r.researcher_username, note: r.note, publishedAt: iso(r.published_at)! }));
}

export async function proposeAcknowledgement(reportId: string, note: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.propose_acknowledgement", [reportId, note || null]));
}

export async function respondAcknowledgement(id: string, publish: boolean): Promise<void> {
  await asActor((c) => callRpc(c, "public.respond_acknowledgement", [id, publish]));
}

export async function revokeAcknowledgement(id: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.revoke_acknowledgement", [id]));
}

/** The organization's view of one report's acknowledgement (RLS: its staff or the researcher). */
export async function getReportAcknowledgement(reportId: string): Promise<{ id: string; status: Acknowledgement["status"] } | null> {
  const actor = await getCurrentUser();
  if (!actor) return null;
  const rows = await withActorTransaction(actor.id, (c) => c.query<{ id: string; status: Acknowledgement["status"] }>("select id, status from public.program_acknowledgements where report_id = $1", [reportId]).then((r) => r.rows));
  return rows[0] ?? null;
}

// Events -------------------------------------------------------------------------------------------------
export type HackingEvent = { id: string; title: string; description: string; format: "online" | "in_person" | "hybrid"; location: string | null; startsAt: string; endsAt: string; registrationClosesAt: string; capacity: number | null; minReputation: number; status: "draft" | "published" | "cancelled"; registeredCount: number; myStatus: "registered" | "cancelled" | null };

export async function listHackingEvents(): Promise<HackingEvent[]> {
  type Row = { id: string; title: string; description: string; format: HackingEvent["format"]; location: string | null; starts_at: string; ends_at: string; registration_closes_at: string; capacity: number | null; min_reputation: number; status: HackingEvent["status"]; registered_count: string; my_status: HackingEvent["myStatus"] };
  const rows = await asActor((c) => callRpc<Row>(c, "public.list_hacking_events"));
  return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, format: r.format, location: r.location, startsAt: iso(r.starts_at)!, endsAt: iso(r.ends_at)!, registrationClosesAt: iso(r.registration_closes_at)!, capacity: r.capacity, minReputation: r.min_reputation, status: r.status, registeredCount: Number(r.registered_count), myStatus: r.my_status }));
}

export async function setEventRegistration(eventId: string, register: boolean): Promise<void> {
  if (register) await asActor((c) => callRpc(c, "public.register_for_hacking_event", [eventId]));
  else await asActor((c) => callRpc(c, "public.cancel_hacking_event_registration", [eventId]));
}

export type EventInput = { id: string | null; title: string; description: string; format: HackingEvent["format"]; location: string; startsAt: string; endsAt: string; registrationClosesAt: string; capacity: number | null; minReputation: number };

export async function saveHackingEvent(e: EventInput): Promise<void> {
  await asActor((c) => callRpc(c, "public.save_hacking_event", [e.id, e.title, e.description, e.format, e.location || null, e.startsAt, e.endsAt, e.registrationClosesAt, e.capacity, e.minReputation]));
}

export async function setHackingEventStatus(id: string, status: "published" | "cancelled"): Promise<void> {
  await asActor((c) => callRpc(c, "public.set_hacking_event_status", [id, status]));
}

// Mentorship ---------------------------------------------------------------------------------------------
export type Mentor = { userId: string; displayName: string; username: string; headline: string; topics: string[]; accepting: boolean; openSlots: number; resolvedReports: number; myRequestStatus: string | null };
export type Mentorship = { id: string; myRole: "mentor" | "mentee"; otherDisplayName: string; otherUsername: string; topic: string; message: string; status: "pending" | "accepted" | "declined" | "cancelled" | "completed"; mentorNote: string | null; createdAt: string };

export async function listMentors(): Promise<Mentor[]> {
  type Row = { user_id: string; display_name: string; username: string; headline: string; topics: string[]; accepting: boolean; open_slots: number; resolved_reports: string; my_request_status: string | null };
  const rows = await asActor((c) => callRpc<Row>(c, "public.list_mentors"));
  return rows.map((r) => ({ userId: r.user_id, displayName: r.display_name, username: r.username, headline: r.headline, topics: r.topics, accepting: r.accepting, openSlots: r.open_slots, resolvedReports: Number(r.resolved_reports), myRequestStatus: r.my_request_status }));
}

export async function listMyMentorships(): Promise<Mentorship[]> {
  type Row = { id: string; my_role: Mentorship["myRole"]; other_display_name: string; other_username: string; topic: string; message: string; status: Mentorship["status"]; mentor_note: string | null; created_at: string };
  const rows = await asActor((c) => callRpc<Row>(c, "public.list_my_mentorships"));
  return rows.map((r) => ({ id: r.id, myRole: r.my_role, otherDisplayName: r.other_display_name, otherUsername: r.other_username, topic: r.topic, message: r.message, status: r.status, mentorNote: r.mentor_note, createdAt: iso(r.created_at)! }));
}

export async function saveMyMentorProfile(headline: string, topics: string[], accepting: boolean, maxActive: number): Promise<void> {
  await asActor((c) => callRpc(c, "public.save_my_mentor_profile", [headline, topics, accepting, maxActive]));
}

export async function getMyMentorProfile(): Promise<{ headline: string; topics: string[]; accepting: boolean; maxActive: number } | null> {
  const actor = await getCurrentUser();
  if (!actor) return null;
  const rows = await withActorTransaction(actor.id, (c) => c.query<{ headline: string; topics: string[]; accepting: boolean; max_active: number }>("select headline, topics, accepting, max_active from public.mentor_profiles where user_id = $1", [actor.id]).then((r) => r.rows));
  return rows[0] ? { headline: rows[0].headline, topics: rows[0].topics, accepting: rows[0].accepting, maxActive: rows[0].max_active } : null;
}

export async function requestMentorship(mentorId: string, topic: string, message: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.request_mentorship", [mentorId, topic, message]));
}

export async function respondMentorshipRequest(id: string, accept: boolean, note: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.respond_mentorship_request", [id, accept, note || null]));
}

export async function closeMentorshipRequest(id: string, outcome: "cancelled" | "completed"): Promise<void> {
  await asActor((c) => callRpc(c, "public.close_mentorship_request", [id, outcome]));
}

// Swag ----------------------------------------------------------------------------------------------------
export type SwagItem = { id: string; name: string; description: string; minReputation: number; stock: number; active: boolean };
export type SwagRequest = { id: string; itemId: string; itemName: string; status: "requested" | "approved" | "shipped" | "rejected" | "cancelled"; staffNote: string | null; trackingReference: string | null; createdAt: string };
export type SwagStaffRequest = { id: string; itemName: string; username: string; shippingName: string; shippingAddress: string; status: SwagRequest["status"]; staffNote: string | null; trackingReference: string | null; createdAt: string };

export async function listSwag(): Promise<{ items: SwagItem[]; requests: SwagRequest[] }> {
  const actor = await getCurrentUser();
  if (!actor) return { items: [], requests: [] };
  return withActorTransaction(actor.id, async (c) => {
    const items = await c.query<{ id: string; name: string; description: string; min_reputation: number; stock: number; active: boolean }>("select id, name, description, min_reputation, stock, active from public.swag_items order by active desc, min_reputation, name");
    const requests = await c.query<{ id: string; item_id: string; name: string; status: SwagRequest["status"]; staff_note: string | null; tracking_reference: string | null; created_at: string }>(
      "select r.id, r.item_id, i.name, r.status, r.staff_note, r.tracking_reference, r.created_at from public.swag_requests r join public.swag_items i on i.id = r.item_id where r.user_id = $1 order by r.created_at desc",
      [actor.id],
    );
    return {
      items: items.rows.map((r) => ({ id: r.id, name: r.name, description: r.description, minReputation: r.min_reputation, stock: r.stock, active: r.active })),
      requests: requests.rows.map((r) => ({ id: r.id, itemId: r.item_id, itemName: r.name, status: r.status, staffNote: r.staff_note, trackingReference: r.tracking_reference, createdAt: iso(r.created_at)! })),
    };
  });
}

export async function requestSwag(itemId: string, shippingName: string, shippingAddress: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.request_swag", [itemId, shippingName, shippingAddress]));
}

export async function cancelSwagRequest(id: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.cancel_swag_request", [id]));
}

export async function listSwagRequestsForStaff(): Promise<SwagStaffRequest[]> {
  type Row = { id: string; item_name: string; username: string; shipping_name: string; shipping_address: string; status: SwagRequest["status"]; staff_note: string | null; tracking_reference: string | null; created_at: string };
  const rows = await asActor((c) => callRpc<Row>(c, "public.list_swag_requests_for_staff"));
  return rows.map((r) => ({ id: r.id, itemName: r.item_name, username: r.username, shippingName: r.shipping_name, shippingAddress: r.shipping_address, status: r.status, staffNote: r.staff_note, trackingReference: r.tracking_reference, createdAt: iso(r.created_at)! }));
}

export async function saveSwagItem(i: { id: string | null; name: string; description: string; minReputation: number; stock: number; active: boolean }): Promise<void> {
  await asActor((c) => callRpc(c, "public.save_swag_item", [i.id, i.name, i.description, i.minReputation, i.stock, i.active]));
}

export async function updateSwagRequest(id: string, status: "approved" | "shipped" | "rejected", note: string, tracking: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.update_swag_request", [id, status, note || null, tracking || null]));
}

// Followed programs -------------------------------------------------------------------------------------
export type FollowedProgram = { programId: string; organizationId: string; programName: string; organizationName: string; programType: "bounty" | "vdp"; programStatus: string; followedAt: string; policyPublishedAt: string | null; scopeChangedAt: string | null };

export async function listMyFollowedPrograms(): Promise<FollowedProgram[]> {
  type Row = { program_id: string; organization_id: string; program_name: string; organization_name: string; program_type: "bounty" | "vdp"; program_status: string; followed_at: string; policy_published_at: string | null; scope_changed_at: string | null };
  const rows = await asActor((c) => callRpc<Row>(c, "public.list_my_followed_programs"));
  return rows.map((r) => ({ programId: r.program_id, organizationId: r.organization_id, programName: r.program_name, organizationName: r.organization_name, programType: r.program_type, programStatus: r.program_status, followedAt: iso(r.followed_at)!, policyPublishedAt: iso(r.policy_published_at), scopeChangedAt: iso(r.scope_changed_at) }));
}

export async function isFollowingProgram(programId: string): Promise<boolean> {
  const actor = await getCurrentUser();
  if (!actor) return false;
  const rows = await withActorTransaction(actor.id, (c) => c.query("select 1 from public.program_follows where user_id = $1 and program_id = $2", [actor.id, programId]).then((r) => r.rows));
  return rows.length > 0;
}

export async function setProgramFollow(programId: string, follow: boolean): Promise<void> {
  await asActor((c) => callRpc(c, "public.set_program_follow", [programId, follow]));
}

// Agreements ---------------------------------------------------------------------------------------------
export type Agreement = { kind: "platform" | "program_policy"; agreementId: string; title: string; version: number; body: string | null; sourcePath: string | null; publishedAt: string; acceptedAt: string | null; programId: string | null; organizationId: string | null };

export async function listMyAgreements(): Promise<Agreement[]> {
  type Row = { kind: Agreement["kind"]; agreement_id: string; title: string; version: number; body: string | null; source_path: string | null; published_at: string; accepted_at: string | null; program_id: string | null; organization_id: string | null };
  const rows = await asActor((c) => callRpc<Row>(c, "public.list_my_agreements"));
  return rows.map((r) => ({ kind: r.kind, agreementId: r.agreement_id, title: r.title, version: r.version, body: r.body, sourcePath: r.source_path, publishedAt: iso(r.published_at)!, acceptedAt: iso(r.accepted_at), programId: r.program_id, organizationId: r.organization_id }));
}

export async function acceptPlatformAgreement(id: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.accept_platform_agreement", [id]));
}

// Dashboard ----------------------------------------------------------------------------------------------
export type ResearcherActions = { collaborationInvitations: number; acknowledgementsToAnswer: number; mentorshipRequestsToAnswer: number; cveEligibleReports: number; unacceptedAgreements: number; upcomingEvents: number; identityVerified: boolean };

export async function getMyResearcherActions(): Promise<ResearcherActions> {
  type Row = { collaboration_invitations: string; acknowledgements_to_answer: string; mentorship_requests_to_answer: string; cve_eligible_reports: string; unaccepted_agreements: string; upcoming_events: string; identity_verified: boolean };
  const [r] = await asActor((c) => callRpc<Row>(c, "public.get_my_researcher_actions"));
  return {
    collaborationInvitations: Number(r?.collaboration_invitations ?? 0),
    acknowledgementsToAnswer: Number(r?.acknowledgements_to_answer ?? 0),
    mentorshipRequestsToAnswer: Number(r?.mentorship_requests_to_answer ?? 0),
    cveEligibleReports: Number(r?.cve_eligible_reports ?? 0),
    unacceptedAgreements: Number(r?.unaccepted_agreements ?? 0),
    upcomingEvents: Number(r?.upcoming_events ?? 0),
    identityVerified: Boolean(r?.identity_verified),
  };
}

// Calendar ------------------------------------------------------------------------------------------------
export type CalendarEntry = { uid: string; kind: "event" | "ctf"; title: string; startsAt: string; endsAt: string; href: string; detail: string };

/** The caller's upcoming dates: hacking events they registered for and live or upcoming CTF
 * events. Built from internal records only. */
export async function listMyCalendar(): Promise<CalendarEntry[]> {
  const [events, ctf] = await Promise.all([listHackingEvents(), import("@/services/ctf-events").then((m) => m.listCtfEvents())]);
  const now = new Date().toISOString();
  const entries: CalendarEntry[] = [
    ...events
      .filter((e) => e.myStatus === "registered" && e.status === "published" && e.endsAt > now)
      .map((e) => ({ uid: `event-${e.id}`, kind: "event" as const, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, href: "/events", detail: e.format === "online" ? "Online" : (e.location ?? "") })),
    ...ctf
      .filter((e) => e.endsAt > now)
      .map((e) => ({ uid: `ctf-${e.id}`, kind: "ctf" as const, title: `CTF: ${e.name}`, startsAt: e.startsAt, endsAt: e.endsAt, href: `/ctf/events/${e.slug}`, detail: `${e.challengeCount} challenges` })),
  ];
  return entries.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
