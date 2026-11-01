import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import type { ReportSeverity, ReportStatus } from "@/types/report";

export type Plan = {
  code: "standard" | "priority";
  name: string;
  description: string;
  priceUsdMinorUnits: number;
  priceInrMinorUnits: number;
  firstResponseTargetHours: number;
  triageTargetHours: number;
};

export type Subscription = {
  organizationId: string;
  planCode: "standard" | "priority";
  currency: "INR" | "USD";
  monthlyPriceMinorUnits: number;
  status: "requested" | "active" | "past_due" | "cancelled" | "declined";
  paidThrough: string | null;
  requestedAt: string;
  decisionNote: string | null;
};

export type Performance = {
  reportsHandled: number;
  firstResponseMet: number;
  firstResponseMeasured: number;
  triageMet: number;
  triageMeasured: number;
  openEscalations: number;
  assessments: number;
};

export type Assessment = {
  id: string;
  validation: "reproduced" | "not_reproduced" | "needs_information" | "out_of_scope";
  suggestedSeverity: ReportSeverity | null;
  duplicateOfReportId: string | null;
  notes: string;
  assessedByName: string | null;
  createdAt: string;
};

export type Escalation = {
  id: string;
  reportId: string;
  programId: string;
  reportTitle?: string;
  reason: string;
  question: string;
  status: "open" | "answered";
  raisedByName: string | null;
  createdAt: string;
  answer: string | null;
  answeredByName: string | null;
  answeredAt: string | null;
};

export type ServiceCharge = {
  id: string;
  description: string;
  amountMinorUnits: number;
  currency: "INR" | "USD";
  automatic: boolean;
  createdAt: string;
};

export type QueueView = "unclaimed" | "mine" | "escalated" | "all";

export type QueueItem = {
  reportId: string;
  programId: string;
  organizationId: string;
  title: string;
  organizationName: string;
  programName: string;
  planCode: "standard" | "priority";
  status: ReportStatus;
  confirmedSeverity: ReportSeverity | null;
  researcherSeverity: ReportSeverity | null;
  firstRespondedAt: string | null;
  firstResponseDueAt: string;
  triagedAt: string | null;
  triageDueAt: string;
  openEscalation: boolean;
  claimedBy: string | null;
  claimedByName: string | null;
};

const DEFAULT_PLANS: Plan[] = [
  {
    code: "standard",
    name: "Standard Managed Triage",
    description: "Business-hours triage coverage with reproduction, duplicate checks, and CVSS validation.",
    priceUsdMinorUnits: 250000,
    priceInrMinorUnits: 20000000,
    firstResponseTargetHours: 12,
    triageTargetHours: 48,
  },
  {
    code: "priority",
    name: "Priority 24/7 Managed Triage",
    description: "Continuous 24/7 analyst coverage with rapid initial response for critical attack surfaces.",
    priceUsdMinorUnits: 500000,
    priceInrMinorUnits: 40000000,
    firstResponseTargetHours: 4,
    triageTargetHours: 24,
  },
];

async function actorId(): Promise<string | null> {
  const actor = await getCurrentUser();
  return actor?.id ?? null;
}

export async function getMyPlatformStaff(): Promise<{
  platformAdmin: boolean;
  triageAnalyst: boolean;
  analystNeedsMfa: boolean;
}> {
  const uid = await actorId();
  if (!uid) return { platformAdmin: false, triageAnalyst: false, analystNeedsMfa: false };
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        platform_admin: boolean;
        triage_analyst: boolean;
        analyst_needs_mfa: boolean;
      }>(client, "public.get_my_platform_staff"),
    );
    const r = rows[0];
    return {
      platformAdmin: Boolean(r?.platform_admin),
      triageAnalyst: Boolean(r?.triage_analyst),
      analystNeedsMfa: Boolean(r?.analyst_needs_mfa),
    };
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listPlans(): Promise<Plan[]> {
  return DEFAULT_PLANS;
}

export async function getSubscription(organizationId: string): Promise<Subscription | null> {
  const uid = await actorId();
  try {
    const res = await withActorTransaction(uid, (client) =>
      client.query<{
        organization_id: string;
        plan_code: "standard" | "priority";
        currency: "INR" | "USD";
        monthly_price_minor_units: number;
        status: Subscription["status"];
        paid_through: string | null;
        requested_at: string;
        decision_note: string | null;
      }>(
        "select organization_id, plan_code, currency, monthly_price_minor_units, status, paid_through, requested_at, decision_note from public.managed_triage_subscriptions where organization_id = $1 limit 1",
        [organizationId],
      ),
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      organizationId: r.organization_id,
      planCode: r.plan_code,
      currency: r.currency,
      monthlyPriceMinorUnits: Number(r.monthly_price_minor_units),
      status: r.status,
      paidThrough: r.paid_through,
      requestedAt: r.requested_at,
      decisionNote: r.decision_note,
    };
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function getPerformance(organizationId: string): Promise<Performance> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{
        reports_handled: string | number;
        first_response_met: string | number;
        first_response_measured: string | number;
        triage_met: string | number;
        triage_measured: string | number;
        open_escalations: string | number;
        assessments: string | number;
      }>(client, "public.get_managed_triage_performance", [organizationId]),
    );
    const r = rows[0];
    return {
      reportsHandled: Number(r?.reports_handled ?? 0),
      firstResponseMet: Number(r?.first_response_met ?? 0),
      firstResponseMeasured: Number(r?.first_response_measured ?? 0),
      triageMet: Number(r?.triage_met ?? 0),
      triageMeasured: Number(r?.triage_measured ?? 0),
      openEscalations: Number(r?.open_escalations ?? 0),
      assessments: Number(r?.assessments ?? 0),
    };
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listOrganizationEscalations(organizationId: string): Promise<Escalation[]> {
  const uid = await actorId();
  try {
    const res = await withActorTransaction(uid, (client) =>
      client.query<{
        id: string;
        report_id: string;
        program_id: string;
        report_title: string;
        reason: string;
        question: string;
        status: "open" | "answered";
        raised_by_name: string | null;
        created_at: string;
        answer: string | null;
        answered_by_name: string | null;
        answered_at: string | null;
      }>(
        "select id, report_id, program_id, report_title, reason, question, status, raised_by_name, created_at, answer, answered_by_name, answered_at from public.managed_triage_escalations where organization_id = $1 order by created_at desc",
        [organizationId],
      ),
    );
    return res.rows.map((r) => ({
      id: r.id,
      reportId: r.report_id,
      programId: r.program_id,
      reportTitle: r.report_title,
      reason: r.reason,
      question: r.question,
      status: r.status,
      raisedByName: r.raised_by_name,
      createdAt: r.created_at,
      answer: r.answer,
      answeredByName: r.answered_by_name,
      answeredAt: r.answered_at,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listServiceCharges(organizationId: string): Promise<ServiceCharge[]> {
  const uid = await actorId();
  try {
    const res = await withActorTransaction(uid, (client) =>
      client.query<{
        id: string;
        description: string;
        amount_minor_units: number;
        currency: "INR" | "USD";
        automatic: boolean;
        created_at: string;
      }>(
        "select id, description, amount_minor_units, currency, automatic, created_at from public.managed_triage_charges where organization_id = $1 order by created_at desc",
        [organizationId],
      ),
    );
    return res.rows.map((r) => ({
      id: r.id,
      description: r.description,
      amountMinorUnits: Number(r.amount_minor_units),
      currency: r.currency,
      automatic: Boolean(r.automatic),
      createdAt: r.created_at,
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function getReportTriagePanel(reportId: string): Promise<{
  claimedBy: string | null;
  claimedByName: string | null;
  escalations: Escalation[];
  assessments: Assessment[];
} | null> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      client.query("select 1 from public.reports where id = $1", [reportId]),
    );
    return {
      claimedBy: null,
      claimedByName: null,
      escalations: [],
      assessments: [],
    };
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listSubscriptionsForAdmin(): Promise<
  {
    organizationId: string;
    organizationName: string;
    status: Subscription["status"];
    planName: string;
    monthlyPriceMinorUnits: number;
    currency: "INR" | "USD";
    requestedByName: string | null;
    requestedAt: string;
    paidThrough: string | null;
    openReports: number;
    availableMinorUnits: number | null;
    decisionNote: string | null;
  }[]
> {
  return [];
}

export async function listAnalysts(): Promise<
  {
    userId: string;
    displayName: string;
    email: string;
    hasMfa: boolean;
    openClaims: number;
    actions30d: number;
  }[]
> {
  return [];
}

export async function listAnalystInvitations(): Promise<
  {
    id: string;
    email: string;
    invitedByName: string | null;
    createdAt: string;
    expiresAt: string;
  }[]
> {
  return [];
}

export async function listQueue(
  _view: QueueView,
  _organizationId: string | null = null,
): Promise<QueueItem[]> {
  return [];
}

export async function requestManagedTriage(
  organizationId: string,
  planCode: string,
  currency: string,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.request_managed_triage", [organizationId, planCode, currency]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function cancelManagedTriage(organizationId: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.cancel_managed_triage", [organizationId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function resumeManagedTriage(organizationId: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.resume_managed_triage", [organizationId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function claimReport(reportId: string, takeOver = false): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.claim_report_for_triage", [reportId, takeOver]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function releaseReport(reportId: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.release_report_claim", [reportId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function recordAssessment(
  reportId: string,
  validation: Assessment["validation"],
  suggestedSeverity: ReportSeverity | null,
  duplicateOf: string | null,
  notes: string,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.record_triage_assessment", [
        reportId,
        validation,
        suggestedSeverity,
        duplicateOf,
        notes,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function escalateToCustomer(
  reportId: string,
  reason: string,
  question: string,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.escalate_report_to_customer", [reportId, reason, question]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function answerEscalation(escalationId: string, answer: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.answer_triage_escalation", [escalationId, answer]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function decideSubscription(
  organizationId: string,
  approve: boolean,
  note: string,
): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.decide_managed_triage_subscription", [
        organizationId,
        approve,
        note,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function inviteAnalyst(
  email: string,
  tokenHash: string,
): Promise<"added" | "invited"> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{ mode?: "added" | "invited" }>(client, "public.invite_triage_analyst", [
        email,
        tokenHash,
      ]),
    );
    return rows[0]?.mode ?? "invited";
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function revokeAnalystInvitation(invitationId: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.revoke_triage_analyst_invitation", [invitationId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function acceptAnalystInvitation(tokenHash: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.accept_triage_analyst_invitation", [tokenHash]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function redeemAnalystInvitation(
  tokenHash: string,
  passwordHash: string,
  name: string,
): Promise<string> {
  const uid = await actorId();
  try {
    const rows = await withActorTransaction(uid, (client) =>
      callRpc<{ user_id?: string }>(client, "public.redeem_triage_analyst_invitation", [
        tokenHash,
        passwordHash,
        name,
      ]),
    );
    return rows[0]?.user_id ?? "";
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function removeAnalyst(userId: string): Promise<void> {
  const uid = await actorId();
  try {
    await withActorTransaction(uid, (client) =>
      callRpc(client, "public.remove_triage_analyst", [userId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}
