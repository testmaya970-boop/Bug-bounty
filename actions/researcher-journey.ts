"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import * as svc from "@/services/researcher-journey";

// Thin, validated entry points for the researcher journey (services/researcher-journey.ts).
// Shape checks only; every business rule is enforced again by the database function.

export type JourneyResult = { ok: true } | { ok: false; message: string };

const id = z.string().uuid();
const text = (max: number, min = 0) => z.string().trim().min(min).max(max);

async function run(paths: string[], work: () => Promise<unknown>): Promise<JourneyResult> {
  try {
    await work();
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  for (const p of paths) revalidatePath(p);
  return { ok: true };
}

function invalid(error: z.ZodError): JourneyResult {
  return { ok: false, message: error.issues[0]?.message ?? "Check the form and try again." };
}

// Collaboration
const inviteSchema = z.object({ reportId: id, username: text(64, 1), splitPercent: z.number().gt(0, "The share must be more than 0.").lt(100, "The share must be less than 100."), message: text(500) });
export async function inviteCollaboratorAction(input: z.input<typeof inviteSchema>) {
  const p = inviteSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(["/settings/collaboration"], () => svc.inviteReportCollaborator(p.data.reportId, p.data.username.replace(/^@/, ""), p.data.splitPercent, p.data.message));
}
export async function respondCollaborationAction(invitationId: string, accept: boolean) {
  if (!id.safeParse(invitationId).success) return { ok: false, message: "Check the request and try again." } as const;
  return run(["/settings/collaboration", "/"], () => svc.respondCollaborationInvitation(invitationId, accept));
}
export async function revokeCollaborationAction(invitationId: string) {
  if (!id.safeParse(invitationId).success) return { ok: false, message: "Check the request and try again." } as const;
  return run(["/settings/collaboration"], () => svc.revokeCollaborationInvitation(invitationId));
}

// CVE
const cveSchema = z.object({ reportId: id, product: text(200, 2), versions: text(200, 1), justification: text(4000, 30) });
export async function requestCveAction(input: z.input<typeof cveSchema>) {
  const p = cveSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(["/recognition"], () => svc.requestCve(p.data.reportId, p.data.product, p.data.versions, p.data.justification));
}
export async function withdrawCveAction(requestId: string) {
  if (!id.safeParse(requestId).success) return { ok: false, message: "Check the request and try again." } as const;
  return run(["/recognition"], () => svc.withdrawCveRequest(requestId));
}
const cveReviewSchema = z.object({ requestId: id, decision: z.enum(["approved", "rejected"]), note: text(2000) });
export async function reviewCveAction(input: z.input<typeof cveReviewSchema>) {
  const p = cveReviewSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(["/platform/cve-requests"], () => svc.reviewCveRequest(p.data.requestId, p.data.decision, p.data.note));
}
const cveAssignSchema = z.object({ requestId: id, cveId: z.string().trim().regex(/^CVE-\d{4}-\d{4,}$/i, "Use the form CVE-2026-12345."), evidenceUrl: z.string().trim().url("Link the public CVE record.").startsWith("https://", "Use an https link.") });
export async function recordCveAssignmentAction(input: z.input<typeof cveAssignSchema>) {
  const p = cveAssignSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(["/platform/cve-requests"], () => svc.recordCveAssignment(p.data.requestId, p.data.cveId, p.data.evidenceUrl));
}

// Acknowledgements
export async function proposeAcknowledgementAction(reportId: string, note: string) {
  const p = z.object({ reportId: id, note: text(280) }).safeParse({ reportId, note });
  if (!p.success) return invalid(p.error);
  return run(["/hall-of-fame"], () => svc.proposeAcknowledgement(p.data.reportId, p.data.note));
}
export async function respondAcknowledgementAction(ackId: string, publish: boolean) {
  if (!id.safeParse(ackId).success) return { ok: false, message: "Check the request and try again." } as const;
  return run(["/recognition", "/hall-of-fame"], () => svc.respondAcknowledgement(ackId, publish));
}
export async function revokeAcknowledgementAction(ackId: string) {
  if (!id.safeParse(ackId).success) return { ok: false, message: "Check the request and try again." } as const;
  return run(["/recognition", "/hall-of-fame"], () => svc.revokeAcknowledgement(ackId));
}

// Events
export async function setEventRegistrationAction(eventId: string, register: boolean) {
  if (!id.safeParse(eventId).success) return { ok: false, message: "Check the request and try again." } as const;
  return run(["/events", "/settings/calendar"], () => svc.setEventRegistration(eventId, register));
}
const eventSchema = z
  .object({
    id: id.nullable(),
    title: text(140, 3),
    description: text(4000, 10),
    format: z.enum(["online", "in_person", "hybrid"]),
    location: text(200),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    registrationClosesAt: z.string().datetime({ offset: true }),
    capacity: z.number().int().min(1).max(10000).nullable(),
    minReputation: z.number().int().min(0),
  })
  .refine((e) => e.endsAt > e.startsAt, "The event must end after it starts.")
  .refine((e) => e.registrationClosesAt <= e.endsAt, "Registration must close before the event ends.")
  .refine((e) => e.format === "online" || e.location.length > 0, "Add a location for in-person or hybrid events.");
export async function saveHackingEventAction(input: z.input<typeof eventSchema>) {
  const p = eventSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(["/platform/events", "/events"], () => svc.saveHackingEvent(p.data));
}
export async function setHackingEventStatusAction(eventId: string, status: "published" | "cancelled") {
  if (!id.safeParse(eventId).success || !["published", "cancelled"].includes(status)) return { ok: false, message: "Check the request and try again." } as const;
  return run(["/platform/events", "/events"], () => svc.setHackingEventStatus(eventId, status));
}

// Mentorship
const mentorSchema = z.object({ headline: text(140, 5), topics: z.array(text(40, 1)).min(1, "Add at least one topic.").max(8), accepting: z.boolean(), maxActive: z.number().int().min(1).max(20) });
export async function saveMentorProfileAction(input: z.input<typeof mentorSchema>) {
  const p = mentorSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(["/mentorship"], () => svc.saveMyMentorProfile(p.data.headline, p.data.topics, p.data.accepting, p.data.maxActive));
}
const mentorshipRequestSchema = z.object({ mentorId: id, topic: text(80, 2), message: text(2000, 20) });
export async function requestMentorshipAction(input: z.input<typeof mentorshipRequestSchema>) {
  const p = mentorshipRequestSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(["/mentorship"], () => svc.requestMentorship(p.data.mentorId, p.data.topic, p.data.message));
}
export async function respondMentorshipAction(requestId: string, accept: boolean, note: string) {
  const p = z.object({ requestId: id, note: text(1000) }).safeParse({ requestId, note });
  if (!p.success) return invalid(p.error);
  return run(["/mentorship", "/"], () => svc.respondMentorshipRequest(p.data.requestId, accept, p.data.note));
}
export async function closeMentorshipAction(requestId: string, outcome: "cancelled" | "completed") {
  if (!id.safeParse(requestId).success || !["cancelled", "completed"].includes(outcome)) return { ok: false, message: "Check the request and try again." } as const;
  return run(["/mentorship"], () => svc.closeMentorshipRequest(requestId, outcome));
}

// Swag
const swagRequestSchema = z.object({ itemId: id, shippingName: text(120, 2), shippingAddress: text(600, 10) });
export async function requestSwagAction(input: z.input<typeof swagRequestSchema>) {
  const p = swagRequestSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(["/settings/swag"], () => svc.requestSwag(p.data.itemId, p.data.shippingName, p.data.shippingAddress));
}
export async function cancelSwagRequestAction(requestId: string) {
  if (!id.safeParse(requestId).success) return { ok: false, message: "Check the request and try again." } as const;
  return run(["/settings/swag"], () => svc.cancelSwagRequest(requestId));
}
const swagItemSchema = z.object({ id: id.nullable(), name: text(100, 2), description: text(1000, 5), minReputation: z.number().int().min(0), stock: z.number().int().min(0), active: z.boolean() });
export async function saveSwagItemAction(input: z.input<typeof swagItemSchema>) {
  const p = swagItemSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(["/platform/swag", "/settings/swag"], () => svc.saveSwagItem(p.data));
}
const swagUpdateSchema = z.object({ requestId: id, status: z.enum(["approved", "shipped", "rejected"]), note: text(500), tracking: text(120) });
export async function updateSwagRequestAction(input: z.input<typeof swagUpdateSchema>) {
  const p = swagUpdateSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(["/platform/swag"], () => svc.updateSwagRequest(p.data.requestId, p.data.status, p.data.note, p.data.tracking));
}

// Follows and agreements
export async function setProgramFollowAction(programId: string, follow: boolean) {
  if (!id.safeParse(programId).success) return { ok: false, message: "Check the request and try again." } as const;
  return run(["/settings/subscriptions"], () => svc.setProgramFollow(programId, follow));
}
export async function acceptAgreementAction(agreementId: string) {
  if (!id.safeParse(agreementId).success) return { ok: false, message: "Check the request and try again." } as const;
  return run(["/settings/digital-agreements", "/"], () => svc.acceptPlatformAgreement(agreementId));
}
