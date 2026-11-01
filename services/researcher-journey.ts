import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import type { ReportStatus } from "@/types/report";

export type ResearcherActions = {
  collaborationInvitations: number;
  acknowledgementsToAnswer: number;
  mentorshipRequestsToAnswer: number;
  cveEligibleReports: number;
  unacceptedAgreements: number;
  upcomingEvents: number;
  identityVerified: boolean;
};

export type Collaboration = {
  kind: "collaborator" | "invitation";
  id: string;
  reportId: string;
  reportTitle: string;
  reportStatus: ReportStatus;
  programName: string;
  reportHref: string | null;
  myRole: "submitter" | "collaborator" | "invitee";
  otherUserId: string;
  otherDisplayName: string;
  otherUsername: string | null;
  splitPercent: number;
  status: string;
  createdAt: string;
  editable: boolean;
};

export type HackingEvent = {
  id: string;
  title: string;
  description: string;
  format: "online" | "in_person" | "hybrid";
  location: string | null;
  startsAt: string;
  endsAt: string;
  registrationClosesAt: string;
  capacity: number | null;
  minReputation: number;
  status: "draft" | "published" | "cancelled";
  registeredCount: number;
  myStatus: string | null;
};

async function actorId(): Promise<string | null> {
  const actor = await getCurrentUser();
  return actor?.id ?? null;
}

export async function getMyResearcherActions(): Promise<ResearcherActions> {
  const uid = await actorId();
  if (!uid) {
    return {
      collaborationInvitations: 0,
      acknowledgementsToAnswer: 0,
      mentorshipRequestsToAnswer: 0,
      cveEligibleReports: 0,
      unacceptedAgreements: 0,
      upcomingEvents: 0,
      identityVerified: true,
    };
  }
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        collaboration_invitations: string | number;
        acknowledgements_to_answer: string | number;
        mentorship_requests_to_answer: string | number;
        cve_eligible_reports: string | number;
        unaccepted_agreements: string | number;
        upcoming_events: string | number;
        identity_verified?: boolean;
      }>(client, "public.get_my_researcher_actions"),
    );
    const r = rows[0];
    if (!r) {
      return {
        collaborationInvitations: 0,
        acknowledgementsToAnswer: 0,
        mentorshipRequestsToAnswer: 0,
        cveEligibleReports: 0,
        unacceptedAgreements: 0,
        upcomingEvents: 0,
        identityVerified: true,
      };
    }
    return {
      collaborationInvitations: Number(r.collaboration_invitations ?? 0),
      acknowledgementsToAnswer: Number(r.acknowledgements_to_answer ?? 0),
      mentorshipRequestsToAnswer: Number(r.mentorship_requests_to_answer ?? 0),
      cveEligibleReports: Number(r.cve_eligible_reports ?? 0),
      unacceptedAgreements: Number(r.unaccepted_agreements ?? 0),
      upcomingEvents: Number(r.upcoming_events ?? 0),
      identityVerified: r.identity_verified ?? true,
    };
  } catch (error) {
    mapError(error as { message: string });
  }
}

// 1. Collaboration
export async function inviteReportCollaborator(
  reportId: string,
  username: string,
  splitPercent: number,
  message: string,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.invite_report_collaborator", [
        reportId,
        username,
        splitPercent,
        message,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function respondCollaborationInvitation(
  invitationId: string,
  accept: boolean,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.respond_collaboration_invitation", [invitationId, accept]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function revokeCollaborationInvitation(invitationId: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.revoke_collaboration_invitation", [invitationId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listMyCollaborations(): Promise<Collaboration[]> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        kind: "collaborator" | "invitation";
        id: string;
        report_id: string;
        report_title: string;
        report_status: ReportStatus;
        program_name: string;
        my_role: "submitter" | "collaborator" | "invitee";
        other_user_id: string;
        other_display_name: string;
        other_username: string | null;
        bounty_split_percent: string | number;
        status: string;
        created_at: string;
        editable: boolean;
      }>(client, "public.list_my_collaborations"),
    );
    return rows.map((r) => ({
      kind: r.kind,
      id: r.id,
      reportId: r.report_id,
      reportTitle: r.report_title,
      reportStatus: r.report_status,
      programName: r.program_name,
      reportHref: r.kind === "collaborator" || r.my_role === "submitter" ? `/reports` : null,
      myRole: r.my_role,
      otherUserId: r.other_user_id,
      otherDisplayName: r.other_display_name,
      otherUsername: r.other_username,
      splitPercent: Number(r.bounty_split_percent),
      status: r.status,
      createdAt: r.created_at,
      editable: Boolean(r.editable),
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// 2. CVE
export async function requestCve(
  reportId: string,
  product: string,
  versions: string,
  justification: string,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.request_cve", [reportId, product, versions, justification]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function withdrawCveRequest(requestId: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.withdraw_cve_request", [requestId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function reviewCveRequest(
  requestId: string,
  decision: "approved" | "rejected",
  note: string,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.review_cve_request", [requestId, decision, note]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function recordCveAssignment(
  requestId: string,
  cveId: string,
  evidenceUrl: string,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.record_cve_assignment", [requestId, cveId, evidenceUrl]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listMyCveRequests(): Promise<
  {
    id: string;
    reportId: string;
    reportTitle: string;
    programName: string;
    affectedProduct: string;
    affectedVersions: string;
    status: string;
    reviewerNote: string | null;
    cveId: string | null;
    cveEvidenceUrl: string | null;
    createdAt: string;
    reviewedAt: string | null;
  }[]
> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        id: string;
        report_id: string;
        report_title: string;
        program_name: string;
        affected_product: string;
        affected_versions: string;
        status: string;
        reviewer_note: string | null;
        cve_id: string | null;
        cve_evidence_url: string | null;
        created_at: string;
        reviewed_at: string | null;
      }>(client, "public.list_my_cve_requests"),
    );
    return rows.map((r) => ({
      id: r.id,
      reportId: r.report_id,
      reportTitle: r.report_title,
      programName: r.program_name,
      affectedProduct: r.affected_product,
      affectedVersions: r.affected_versions,
      status: r.status,
      reviewerNote: r.reviewer_note,
      cveId: r.cve_id,
      cveEvidenceUrl: r.cve_evidence_url,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listMyCveEligibleReports(): Promise<
  {
    reportId: string;
    reportTitle: string;
    programName: string;
    publishedTitle: string | null;
  }[]
> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        report_id: string;
        report_title: string;
        program_name: string;
        published_title: string | null;
      }>(client, "public.list_my_cve_eligible_reports"),
    );
    return rows.map((r) => ({
      reportId: r.report_id,
      reportTitle: r.report_title,
      programName: r.program_name,
      publishedTitle: r.published_title,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listCveRequestsForReview(): Promise<
  {
    id: string;
    reportId: string;
    publishedTitle: string | null;
    organizationName: string;
    programName: string;
    requesterUsername: string;
    affectedProduct: string;
    affectedVersions: string;
    justification: string;
    status: "pending" | "approved";
    reviewerNote: string | null;
    cveId: string | null;
    createdAt: string;
  }[]
> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        id: string;
        report_id: string;
        published_title: string | null;
        organization_name: string;
        program_name: string;
        requester_username: string;
        affected_product: string;
        affected_versions: string;
        justification: string;
        status: "pending" | "approved";
        reviewer_note: string | null;
        cve_id: string | null;
        created_at: string;
      }>(client, "public.list_cve_requests_for_review"),
    );
    return rows.map((r) => ({
      id: r.id,
      reportId: r.report_id,
      publishedTitle: r.published_title,
      organizationName: r.organization_name,
      programName: r.program_name,
      requesterUsername: r.requester_username,
      affectedProduct: r.affected_product,
      affectedVersions: r.affected_versions,
      justification: r.justification,
      status: r.status,
      reviewerNote: r.reviewer_note,
      cveId: r.cve_id,
      createdAt: r.created_at,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// 3. Acknowledgements (Hall of Fame)
export async function proposeAcknowledgement(reportId: string, note: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.propose_acknowledgement", [reportId, note]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function respondAcknowledgement(ackId: string, publish: boolean): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.respond_acknowledgement", [ackId, publish]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function revokeAcknowledgement(ackId: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.revoke_acknowledgement", [ackId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function getReportAcknowledgement(
  reportId: string,
): Promise<{
  id: string;
  status: "proposed" | "published" | "declined" | "revoked";
  note: string | null;
} | null> {
  const uid = await actorId();
  try {
    const res = await withActorTransaction(uid, (client) =>
      client.query<{
        id: string;
        status: "proposed" | "published" | "declined" | "revoked";
        note: string | null;
      }>(
        "select id, status, note from public.program_acknowledgements where report_id = $1 limit 1",
        [reportId],
      ),
    );
    return res.rows[0] ?? null;
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listMyAcknowledgements(): Promise<
  {
    id: string;
    programId: string;
    organizationId: string;
    programName: string;
    organizationName: string;
    reportId: string;
    reportTitle: string;
    status: string;
    note: string | null;
    createdAt: string;
    publishedAt: string | null;
  }[]
> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        id: string;
        program_id: string;
        organization_id: string;
        program_name: string;
        organization_name: string;
        report_id: string;
        report_title: string;
        status: string;
        note: string | null;
        created_at: string;
        published_at: string | null;
      }>(client, "public.list_my_acknowledgements"),
    );
    return rows.map((r) => ({
      id: r.id,
      programId: r.program_id,
      organizationId: r.organization_id,
      programName: r.program_name,
      organizationName: r.organization_name,
      reportId: r.report_id,
      reportTitle: r.report_title,
      status: r.status,
      note: r.note,
      createdAt: r.created_at,
      publishedAt: r.published_at,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listHallOfFame(
  programId: string | null = null,
  limit = 100,
): Promise<
  {
    programId: string;
    organizationId: string;
    programName: string;
    organizationName: string;
    researcherDisplayName: string;
    researcherUsername: string | null;
    note: string | null;
    publishedAt: string;
  }[]
> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        program_id: string;
        organization_id: string;
        program_name: string;
        organization_name: string;
        researcher_display_name: string;
        researcher_username: string | null;
        note: string | null;
        published_at: string;
      }>(client, "public.list_hall_of_fame", [programId, limit]),
    );
    return rows.map((r) => ({
      programId: r.program_id,
      organizationId: r.organization_id,
      programName: r.program_name,
      organizationName: r.organization_name,
      researcherDisplayName: r.researcher_display_name,
      researcherUsername: r.researcher_username,
      note: r.note,
      publishedAt: r.published_at,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// 4. Hacking Events & Calendar
export async function saveHackingEvent(input: {
  id: string | null;
  title: string;
  description: string;
  format: "online" | "in_person" | "hybrid";
  location: string;
  startsAt: string;
  endsAt: string;
  registrationClosesAt: string;
  capacity: number | null;
  minReputation: number;
}): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.save_hacking_event", [
        input.id,
        input.title,
        input.description,
        input.format,
        input.location,
        input.startsAt,
        input.endsAt,
        input.registrationClosesAt,
        input.capacity,
        input.minReputation,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function setHackingEventStatus(
  eventId: string,
  status: "published" | "cancelled",
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.set_hacking_event_status", [eventId, status]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function setEventRegistration(eventId: string, register: boolean): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(
        client,
        register
          ? "public.register_for_hacking_event"
          : "public.cancel_hacking_event_registration",
        [eventId],
      ),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listHackingEvents(): Promise<HackingEvent[]> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        id: string;
        title: string;
        description: string;
        format: "online" | "in_person" | "hybrid";
        location: string | null;
        starts_at: string;
        ends_at: string;
        registration_closes_at: string;
        capacity: number | null;
        min_reputation: number;
        status: "draft" | "published" | "cancelled";
        registered_count: string | number;
        my_status: string | null;
      }>(client, "public.list_hacking_events"),
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      format: r.format,
      location: r.location,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      registrationClosesAt: r.registration_closes_at,
      capacity: r.capacity,
      minReputation: Number(r.min_reputation ?? 0),
      status: r.status,
      registeredCount: Number(r.registered_count ?? 0),
      myStatus: r.my_status,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listMyCalendar(): Promise<
  {
    uid: string;
    kind: "event" | "ctf";
    title: string;
    startsAt: string;
    endsAt: string;
    href: string;
    detail: string;
  }[]
> {
  const events = await listHackingEvents();
  return events
    .filter((e) => e.myStatus === "registered" && e.status === "published")
    .map((e) => ({
      uid: `event-${e.id}`,
      kind: "event" as const,
      title: e.title,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      href: "/events",
      detail: e.location ? `${e.format} · ${e.location}` : e.format,
    }));
}

// 5. Mentorship
export async function saveMyMentorProfile(
  headline: string,
  topics: string[],
  accepting: boolean,
  maxActive: number,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.save_my_mentor_profile", [
        headline,
        topics,
        accepting,
        maxActive,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function getMyMentorProfile(): Promise<{
  headline: string;
  topics: string[];
  accepting: boolean;
  maxActive: number;
} | null> {
  const uid = await actorId();
  if (!uid) return null;
  try {
    const res = await withActorTransaction(uid, (client) =>
      client.query<{
        headline: string;
        topics: string[];
        accepting: boolean;
        max_active: number;
      }>(
        "select headline, topics, accepting, max_active from public.mentor_profiles where user_id = $1 limit 1",
        [uid],
      ),
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      headline: r.headline,
      topics: r.topics ?? [],
      accepting: Boolean(r.accepting),
      maxActive: Number(r.max_active ?? 3),
    };
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listMentors(): Promise<
  {
    userId: string;
    displayName: string;
    username: string;
    headline: string;
    topics: string[];
    accepting: boolean;
    openSlots: number;
    resolvedReports: number;
    myRequestStatus: string | null;
  }[]
> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        user_id: string;
        display_name: string;
        username: string;
        headline: string;
        topics: string[];
        accepting: boolean;
        open_slots: number;
        resolved_reports: string | number;
        my_request_status: string | null;
      }>(client, "public.list_mentors"),
    );
    return rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      username: r.username,
      headline: r.headline,
      topics: r.topics ?? [],
      accepting: Boolean(r.accepting),
      openSlots: Number(r.open_slots ?? 0),
      resolvedReports: Number(r.resolved_reports ?? 0),
      myRequestStatus: r.my_request_status,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function requestMentorship(
  mentorId: string,
  topic: string,
  message: string,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.request_mentorship", [mentorId, topic, message]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function respondMentorshipRequest(
  requestId: string,
  accept: boolean,
  note: string,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.respond_mentorship_request", [requestId, accept, note]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function closeMentorshipRequest(
  requestId: string,
  outcome: "cancelled" | "completed",
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.close_mentorship_request", [requestId, outcome]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listMyMentorships(): Promise<
  {
    id: string;
    myRole: "mentor" | "mentee";
    otherDisplayName: string;
    otherUsername: string;
    topic: string;
    message: string;
    status: string;
    mentorNote: string | null;
    createdAt: string;
  }[]
> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        id: string;
        my_role: "mentor" | "mentee";
        other_display_name: string;
        other_username: string;
        topic: string;
        message: string;
        status: string;
        mentor_note: string | null;
        created_at: string;
      }>(client, "public.list_my_mentorships"),
    );
    return rows.map((r) => ({
      id: r.id,
      myRole: r.my_role,
      otherDisplayName: r.other_display_name,
      otherUsername: r.other_username,
      topic: r.topic,
      message: r.message,
      status: r.status,
      mentorNote: r.mentor_note,
      createdAt: r.created_at,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// 6. Swag
export async function saveSwagItem(input: {
  id: string | null;
  name: string;
  description: string;
  minReputation: number;
  stock: number;
  active: boolean;
}): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.save_swag_item", [
        input.id,
        input.name,
        input.description,
        input.minReputation,
        input.stock,
        input.active,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function requestSwag(
  itemId: string,
  shippingName: string,
  shippingAddress: string,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.request_swag", [itemId, shippingName, shippingAddress]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function cancelSwagRequest(requestId: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.cancel_swag_request", [requestId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function updateSwagRequest(
  requestId: string,
  status: "approved" | "shipped" | "rejected",
  note: string,
  tracking: string,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.update_swag_request", [requestId, status, note, tracking]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listSwag(): Promise<{
  items: {
    id: string;
    name: string;
    description: string;
    minReputation: number;
    stock: number;
    active: boolean;
  }[];
  requests: {
    id: string;
    itemId: string;
    itemName: string;
    status: string;
    staffNote: string | null;
    trackingReference: string | null;
    createdAt: string;
  }[];
}> {
  const uid = await actorId();
  try {
    return await withActorTransaction(uid, async (client) => {
      const itemsRes = await client.query<{
        id: string;
        name: string;
        description: string;
        min_reputation: number;
        stock: number;
        active: boolean;
      }>("select id, name, description, min_reputation, stock, active from public.swag_items order by min_reputation asc, name asc");
      const reqRes = await client.query<{
        id: string;
        item_id: string;
        item_name: string;
        status: string;
        staff_note: string | null;
        tracking_reference: string | null;
        created_at: string;
      }>(
        "select r.id, r.item_id, i.name as item_name, r.status, r.staff_note, r.tracking_reference, r.created_at from public.swag_requests r join public.swag_items i on i.id = r.item_id where r.user_id = $1 order by r.created_at desc",
        [uid],
      );
      return {
        items: itemsRes.rows.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          minReputation: Number(i.min_reputation ?? 0),
          stock: Number(i.stock ?? 0),
          active: Boolean(i.active),
        })),
        requests: reqRes.rows.map((r) => ({
          id: r.id,
          itemId: r.item_id,
          itemName: r.item_name,
          status: r.status,
          staffNote: r.staff_note,
          trackingReference: r.tracking_reference,
          createdAt: r.created_at,
        })),
      };
    });
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listSwagRequestsForStaff(): Promise<
  {
    id: string;
    itemName: string;
    username: string;
    shippingName: string;
    shippingAddress: string;
    status: "requested" | "approved" | "shipped" | "rejected" | "cancelled";
    staffNote: string | null;
    trackingReference: string | null;
    createdAt: string;
  }[]
> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        id: string;
        item_name: string;
        username: string;
        shipping_name: string;
        shipping_address: string;
        status: "requested" | "approved" | "shipped" | "rejected" | "cancelled";
        staff_note: string | null;
        tracking_reference: string | null;
        created_at: string;
      }>(client, "public.list_swag_requests_for_staff"),
    );
    return rows.map((r) => ({
      id: r.id,
      itemName: r.item_name,
      username: r.username,
      shippingName: r.shipping_name,
      shippingAddress: r.shipping_address,
      status: r.status,
      staffNote: r.staff_note,
      trackingReference: r.tracking_reference,
      createdAt: r.created_at,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// 7. Program Follows ("Subscriptions")
export async function isFollowingProgram(programId: string): Promise<boolean> {
  const uid = await actorId();
  if (!uid) return false;
  try {
    const res = await withActorTransaction(uid, (client) =>
      client.query<{ program_id: string }>(
        "select program_id from public.program_follows where user_id = $1 and program_id = $2 limit 1",
        [uid, programId],
      ),
    );
    return res.rows.length > 0;
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function setProgramFollow(programId: string, follow: boolean): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.set_program_follow", [programId, follow]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listMyFollowedPrograms(): Promise<
  {
    programId: string;
    organizationId: string;
    programName: string;
    organizationName: string;
    programType: "bounty" | "vdp";
    programStatus: string;
    followedAt: string;
    policyPublishedAt: string | null;
    scopeChangedAt: string | null;
  }[]
> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        program_id: string;
        organization_id: string;
        program_name: string;
        organization_name: string;
        program_type: "bounty" | "vdp";
        program_status: string;
        followed_at: string;
        policy_published_at: string | null;
        scope_changed_at: string | null;
      }>(client, "public.list_my_followed_programs"),
    );
    return rows.map((r) => ({
      programId: r.program_id,
      organizationId: r.organization_id,
      programName: r.program_name,
      organizationName: r.organization_name,
      programType: r.program_type,
      programStatus: r.program_status,
      followedAt: r.followed_at,
      policyPublishedAt: r.policy_published_at,
      scopeChangedAt: r.scope_changed_at,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// 8. Platform Agreements
export async function acceptPlatformAgreement(agreementId: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.accept_platform_agreement", [agreementId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listMyAgreements(): Promise<
  {
    kind: "platform" | "program_policy";
    agreementId: string;
    title: string;
    version: number;
    body: string | null;
    sourcePath: string | null;
    publishedAt: string;
    acceptedAt: string | null;
    programId: string | null;
    organizationId: string | null;
  }[]
> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        kind: "platform" | "program_policy";
        agreement_id: string;
        title: string;
        version: number;
        body: string | null;
        source_path: string | null;
        published_at: string;
        accepted_at: string | null;
        program_id: string | null;
        organization_id: string | null;
      }>(client, "public.list_my_agreements"),
    );
    return rows.map((r) => ({
      kind: r.kind,
      agreementId: r.agreement_id,
      title: r.title,
      version: Number(r.version ?? 1),
      body: r.body,
      sourcePath: r.source_path,
      publishedAt: r.published_at,
      acceptedAt: r.accepted_at,
      programId: r.program_id,
      organizationId: r.organization_id,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}
