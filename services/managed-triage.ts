import "server-only";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import type { ReportSeverity, ReportStatus } from "@/types/report";

// Managed Triage (202610290008). Every rule -- who buys it, who activates it, what analysts can
// touch, billing -- is enforced by the database functions; this file calls them and reads under RLS.

async function asActor<T>(fn: Parameters<typeof withActorTransaction<T>>[1]): Promise<T> {
  const actor = await getCurrentUser();
  try {
    return await withActorTransaction(actor?.id ?? null, fn);
  } catch (error) {
    mapError(error as { message: string });
  }
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

export type PlatformStaff = { platformAdmin: boolean; triageAnalyst: boolean; analystNeedsMfa: boolean };

/** One query for the app shell. Fails closed. */
export async function getMyPlatformStaff(): Promise<PlatformStaff> {
  const actor = await getCurrentUser();
  if (!actor) return { platformAdmin: false, triageAnalyst: false, analystNeedsMfa: false };
  try {
    const rows = await withActorTransaction(actor.id, (c) => callRpc<{ platform_admin: boolean; triage_analyst: boolean; analyst_needs_mfa: boolean }>(c, "public.get_my_platform_staff"));
    return { platformAdmin: rows[0]?.platform_admin === true, triageAnalyst: rows[0]?.triage_analyst === true, analystNeedsMfa: rows[0]?.analyst_needs_mfa === true };
  } catch {
    return { platformAdmin: false, triageAnalyst: false, analystNeedsMfa: false };
  }
}

// ---- Plans and subscriptions (organization side) ----

export type Plan = { code: "standard" | "priority"; name: string; description: string; firstResponseTargetHours: number; triageTargetHours: number; priceUsdMinorUnits: number; priceInrMinorUnits: number };
export type SubscriptionStatus = "requested" | "active" | "past_due" | "cancelled" | "declined";
export type Subscription = { planCode: Plan["code"]; currency: "INR" | "USD"; monthlyPriceMinorUnits: number; status: SubscriptionStatus; requestedAt: string; activatedAt: string | null; paidThrough: string | null; decisionNote: string | null };

export async function listPlans(): Promise<Plan[]> {
  const rows = await asActor((c) => c.query("select * from public.managed_triage_plans order by monthly_price_usd_minor_units").then((r) => r.rows));
  return rows.map((r) => ({ code: r.code, name: r.name, description: r.description, firstResponseTargetHours: r.first_response_target_hours, triageTargetHours: r.triage_target_hours, priceUsdMinorUnits: Number(r.monthly_price_usd_minor_units), priceInrMinorUnits: Number(r.monthly_price_inr_minor_units) }));
}

export async function getSubscription(organizationId: string): Promise<Subscription | null> {
  const r = await asActor((c) => c.query("select * from public.managed_triage_subscriptions where organization_id = $1", [organizationId]).then((x) => x.rows[0]));
  if (!r) return null;
  return { planCode: r.plan_code, currency: r.currency, monthlyPriceMinorUnits: Number(r.monthly_price_minor_units), status: r.status, requestedAt: iso(r.requested_at)!, activatedAt: iso(r.activated_at), paidThrough: r.paid_through ? new Date(r.paid_through).toISOString().slice(0, 10) : null, decisionNote: r.decision_note };
}

export type ServiceCharge = { id: string; description: string; currency: string; amountMinorUnits: number; createdAt: string; automatic: boolean };
export async function listServiceCharges(organizationId: string): Promise<ServiceCharge[]> {
  const rows = await asActor((c) => c.query("select * from public.organization_service_charges where organization_id = $1 order by created_at desc limit 24", [organizationId]).then((r) => r.rows));
  return rows.map((r) => ({ id: r.id, description: r.description, currency: r.currency, amountMinorUnits: Number(r.amount_minor_units), createdAt: iso(r.created_at)!, automatic: r.charged_by === null }));
}

export type Performance = { reportsHandled: number; firstResponseMet: number; firstResponseMeasured: number; triageMet: number; triageMeasured: number; openEscalations: number; assessments: number };
export async function getPerformance(organizationId: string): Promise<Performance> {
  const rows = await asActor((c) => callRpc<Record<string, string>>(c, "public.get_managed_triage_performance", [organizationId]));
  const r = rows[0] ?? {};
  return { reportsHandled: Number(r.reports_handled ?? 0), firstResponseMet: Number(r.first_response_met ?? 0), firstResponseMeasured: Number(r.first_response_measured ?? 0), triageMet: Number(r.triage_met ?? 0), triageMeasured: Number(r.triage_measured ?? 0), openEscalations: Number(r.open_escalations ?? 0), assessments: Number(r.assessments ?? 0) };
}

export async function requestManagedTriage(organizationId: string, planCode: string, currency: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.request_managed_triage", [organizationId, planCode, currency]));
}
export async function cancelManagedTriage(organizationId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.cancel_managed_triage", [organizationId]));
}
export async function resumeManagedTriage(organizationId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.resume_managed_triage", [organizationId]));
}

// ---- Escalations and assessments ----

export type Escalation = { id: string; reportId: string; reportTitle: string | null; programId: string; reason: string; question: string; status: "open" | "answered"; raisedByName: string | null; createdAt: string; answer: string | null; answeredByName: string | null; answeredAt: string | null };
const ESCALATION_SELECT = `select e.*, r.title, ru.display_name as raised_by_name, au.display_name as answered_by_name
  from public.report_triage_escalations e join public.reports r on r.id = e.report_id
  left join public.users ru on ru.id = e.raised_by left join public.users au on au.id = e.answered_by`;
const mapEscalation = (r: Record<string, never>): Escalation => ({ id: r.id, reportId: r.report_id, reportTitle: r.title, programId: r.program_id, reason: r.reason, question: r.question, status: r.status, raisedByName: r.raised_by_name, createdAt: iso(r.created_at)!, answer: r.answer, answeredByName: r.answered_by_name, answeredAt: iso(r.answered_at) });

export async function listOrganizationEscalations(organizationId: string): Promise<Escalation[]> {
  const rows = await asActor((c) => c.query(`${ESCALATION_SELECT} where e.organization_id = $1 order by (e.status = 'open') desc, e.created_at desc limit 50`, [organizationId]).then((r) => r.rows));
  return rows.map(mapEscalation);
}

export type Assessment = { id: string; validation: "reproduced" | "not_reproduced" | "needs_information" | "out_of_scope"; suggestedSeverity: ReportSeverity | null; duplicateOfReportId: string | null; notes: string; assessedByName: string | null; createdAt: string };
export type ReportTriagePanel = { claimedBy: string | null; claimedByName: string | null; escalations: Escalation[]; assessments: Assessment[] };

export async function getReportTriagePanel(reportId: string): Promise<ReportTriagePanel> {
  return asActor(async (c) => {
    const claim = (await c.query("select c.analyst_id, u.display_name from public.managed_triage_claims c left join public.users u on u.id = c.analyst_id where c.report_id = $1", [reportId])).rows[0];
    const escalations = (await c.query(`${ESCALATION_SELECT} where e.report_id = $1 order by e.created_at desc`, [reportId])).rows.map(mapEscalation);
    const assessments = (
      await c.query("select a.*, u.display_name from public.report_triage_assessments a left join public.users u on u.id = a.assessed_by where a.report_id = $1 order by a.created_at desc limit 10", [reportId])
    ).rows.map((r) => ({ id: r.id, validation: r.validation, suggestedSeverity: r.suggested_severity, duplicateOfReportId: r.duplicate_of_report_id, notes: r.notes, assessedByName: r.display_name, createdAt: iso(r.created_at)! }));
    return { claimedBy: claim?.analyst_id ?? null, claimedByName: claim?.display_name ?? null, escalations, assessments };
  });
}

export async function recordAssessment(reportId: string, validation: string, suggestedSeverity: string | null, duplicateOf: string | null, notes: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.record_triage_assessment", [reportId, validation, suggestedSeverity ?? "", duplicateOf, notes]));
}
export async function escalateToCustomer(reportId: string, reason: string, question: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.escalate_report_to_customer", [reportId, reason, question]));
}
export async function answerEscalation(escalationId: string, answer: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.answer_triage_escalation", [escalationId, answer]));
}

// ---- Analyst queue ----

export type QueueView = "unclaimed" | "mine" | "escalated" | "all";
export type QueueItem = {
  reportId: string; title: string; organizationId: string; organizationName: string; programId: string; programName: string; status: ReportStatus;
  researcherSeverity: ReportSeverity | null; confirmedSeverity: ReportSeverity | null; submittedAt: string; planCode: string;
  firstResponseDueAt: string; firstRespondedAt: string | null; triageDueAt: string; triagedAt: string | null; claimedBy: string | null; claimedByName: string | null; openEscalation: boolean;
};

export async function listQueue(view: QueueView, organizationId: string | null): Promise<QueueItem[]> {
  const rows = await asActor((c) => callRpc<Record<string, never>>(c, "public.list_managed_triage_queue", [view, organizationId]));
  return rows.map((r) => ({
    reportId: r.report_id, title: r.title, organizationId: r.organization_id, organizationName: r.organization_name, programId: r.program_id, programName: r.program_name, status: r.status,
    researcherSeverity: r.researcher_severity, confirmedSeverity: r.confirmed_severity, submittedAt: iso(r.submitted_at)!, planCode: r.plan_code,
    firstResponseDueAt: iso(r.first_response_due_at)!, firstRespondedAt: iso(r.first_responded_at), triageDueAt: iso(r.triage_due_at)!, triagedAt: iso(r.triaged_at),
    claimedBy: r.claimed_by, claimedByName: r.claimed_by_name, openEscalation: r.open_escalation,
  }));
}

export async function claimReport(reportId: string, takeOver: boolean): Promise<void> {
  await asActor((c) => callRpc(c, "public.claim_managed_report", [reportId, takeOver]));
}
export async function releaseReport(reportId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.release_managed_report", [reportId]));
}

// ---- Platform admin ----

export type AdminSubscription = { organizationId: string; organizationName: string; planName: string; currency: string; monthlyPriceMinorUnits: number; status: SubscriptionStatus; requestedByName: string | null; requestedAt: string; activatedAt: string | null; paidThrough: string | null; decisionNote: string | null; availableMinorUnits: number | null; openReports: number };
export async function listSubscriptionsForAdmin(): Promise<AdminSubscription[]> {
  const rows = await asActor((c) => callRpc<Record<string, never>>(c, "public.list_managed_triage_subscriptions"));
  return rows.map((r) => ({ organizationId: r.organization_id, organizationName: r.organization_name, planName: r.plan_name, currency: r.currency, monthlyPriceMinorUnits: Number(r.monthly_price_minor_units), status: r.status, requestedByName: r.requested_by_name, requestedAt: iso(r.requested_at)!, activatedAt: iso(r.activated_at), paidThrough: r.paid_through ? new Date(r.paid_through).toISOString().slice(0, 10) : null, decisionNote: r.decision_note, availableMinorUnits: r.available_minor_units === null ? null : Number(r.available_minor_units), openReports: Number(r.open_reports) }));
}
export async function decideSubscription(organizationId: string, approve: boolean, note: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.decide_managed_triage", [organizationId, approve, note || null]));
}

export type Analyst = { userId: string; displayName: string; email: string; addedAt: string; hasMfa: boolean; openClaims: number; actions30d: number };
export async function listAnalysts(): Promise<Analyst[]> {
  const rows = await asActor((c) => callRpc<Record<string, never>>(c, "public.list_triage_analysts"));
  return rows.map((r) => ({ userId: r.user_id, displayName: r.display_name, email: r.email, addedAt: iso(r.added_at)!, hasMfa: r.has_mfa, openClaims: Number(r.open_claims), actions30d: Number(r.actions_30d) }));
}
/** 'added': an existing verified account is an analyst now. 'invited': no account yet, so an
 * invitation for tokenHash was stored and the caller emails the join link. */
export async function inviteAnalyst(email: string, tokenHash: string): Promise<"added" | "invited"> {
  const rows = await asActor((c) => callRpc<{ invite_triage_analyst: "added" | "invited" }>(c, "public.invite_triage_analyst", [email, tokenHash]));
  return rows[0].invite_triage_analyst;
}

export type AnalystInvitation = { id: string; email: string; invitedByName: string | null; createdAt: string; expiresAt: string };
export async function listAnalystInvitations(): Promise<AnalystInvitation[]> {
  const rows = await asActor((c) => callRpc<Record<string, never>>(c, "public.list_triage_analyst_invitations"));
  return rows.map((r) => ({ id: r.id, email: r.email, invitedByName: r.invited_by_name, createdAt: iso(r.created_at)!, expiresAt: iso(r.expires_at)! }));
}
export async function revokeAnalystInvitation(invitationId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.revoke_triage_analyst_invitation", [invitationId]));
}
export async function acceptAnalystInvitation(tokenHash: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.accept_triage_analyst_invitation", [tokenHash]));
}
/** No session yet: the database creates the verified account and makes it an analyst. */
export async function redeemAnalystInvitation(tokenHash: string, passwordHash: string, displayName: string): Promise<string> {
  try {
    const rows = await withServiceRoleTransaction((c) => callRpc<{ redeem_triage_analyst_invitation: string }>(c, "public.redeem_triage_analyst_invitation", [tokenHash, passwordHash, displayName]));
    return rows[0].redeem_triage_analyst_invitation;
  } catch (error) {
    mapError(error as { message: string });
  }
}
export async function removeAnalyst(userId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.remove_triage_analyst", [userId]));
}
