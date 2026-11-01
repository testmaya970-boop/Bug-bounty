"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { passwordProblem } from "@/lib/auth/password-policy";
import { establishSessionForUser } from "@/services/auth";
import { OrganizationServiceError } from "@/services/rpc-error";
import { invitationUrl, sendInvitationEmail } from "@/lib/invitation-email";
import {
  acceptAnalystInvitation,
  answerEscalation,
  cancelManagedTriage,
  claimReport,
  decideSubscription,
  escalateToCustomer,
  inviteAnalyst,
  recordAssessment,
  redeemAnalystInvitation,
  releaseReport,
  removeAnalyst,
  revokeAnalystInvitation,
  requestManagedTriage,
  resumeManagedTriage,
} from "@/services/managed-triage";

type Result = { ok: true } | { ok: false; message: string };
const id = z.string().uuid();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function run(paths: string[], work: () => Promise<void>): Promise<Result> {
  try {
    await work();
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  for (const p of paths) revalidatePath(p, "layout");
  return { ok: true };
}
const bad = (message = "Check the request and try again."): Result => ({ ok: false, message });

// Organization: buy, cancel, resume.
export async function requestManagedTriageAction(organizationId: string, planCode: string, currency: string): Promise<Result> {
  const p = z.object({ organizationId: id, planCode: z.enum(["standard", "priority"]), currency: z.enum(["INR", "USD"]) }).safeParse({ organizationId, planCode, currency });
  if (!p.success) return bad();
  return run([`/organizations/${organizationId}/managed-triage`], () => requestManagedTriage(organizationId, planCode, currency));
}
export async function cancelManagedTriageAction(organizationId: string): Promise<Result> {
  if (!id.safeParse(organizationId).success) return bad();
  return run([`/organizations/${organizationId}/managed-triage`], () => cancelManagedTriage(organizationId));
}
export async function resumeManagedTriageAction(organizationId: string): Promise<Result> {
  if (!id.safeParse(organizationId).success) return bad();
  return run([`/organizations/${organizationId}/managed-triage`, `/organizations/${organizationId}/payments`], () => resumeManagedTriage(organizationId));
}

// Analysts: queue and report work.
export async function claimReportAction(reportId: string, takeOver = false): Promise<Result> {
  if (!id.safeParse(reportId).success) return bad();
  return run(["/triage", "/organizations"], () => claimReport(reportId, takeOver));
}
export async function releaseReportAction(reportId: string): Promise<Result> {
  if (!id.safeParse(reportId).success) return bad();
  return run(["/triage", "/organizations"], () => releaseReport(reportId));
}

const assessmentSchema = z.object({
  reportId: id,
  validation: z.enum(["reproduced", "not_reproduced", "needs_information", "out_of_scope"]),
  suggestedSeverity: z.enum(["", "none", "low", "medium", "high", "critical"]),
  duplicateOf: z.union([id, z.literal("")]),
  notes: z.string().trim().min(1, "Write what you checked.").max(4000),
});
export async function recordAssessmentAction(input: z.input<typeof assessmentSchema>): Promise<Result> {
  const p = assessmentSchema.safeParse(input);
  if (!p.success) return bad(p.error.issues[0]?.message);
  return run(["/organizations", "/triage"], () => recordAssessment(p.data.reportId, p.data.validation, p.data.suggestedSeverity || null, p.data.duplicateOf || null, p.data.notes));
}

const escalationSchema = z.object({
  reportId: id,
  reason: z.enum(["severity_decision", "scope_question", "business_impact", "sensitive_data", "bounty_recommendation", "other"]),
  question: z.string().trim().min(5, "Ask the customer a clear question.").max(4000),
});
export async function escalateAction(input: z.input<typeof escalationSchema>): Promise<Result> {
  const p = escalationSchema.safeParse(input);
  if (!p.success) return bad(p.error.issues[0]?.message);
  return run(["/organizations", "/triage"], () => escalateToCustomer(p.data.reportId, p.data.reason, p.data.question));
}

export async function answerEscalationAction(escalationId: string, answer: string): Promise<Result> {
  const p = z.object({ escalationId: id, answer: z.string().trim().min(1, "Write an answer.").max(4000) }).safeParse({ escalationId, answer });
  if (!p.success) return bad(p.error.issues[0]?.message);
  return run(["/organizations", "/triage"], () => answerEscalation(escalationId, p.data.answer));
}

// Platform admin.
export async function decideSubscriptionAction(organizationId: string, approve: boolean, note: string): Promise<Result> {
  const p = z.object({ organizationId: id, note: z.string().trim().max(1000) }).safeParse({ organizationId, note });
  if (!p.success) return bad();
  return run(["/platform/managed-triage"], () => decideSubscription(organizationId, approve, p.data.note));
}
const ROLE_TEXT =
  "You'll triage reports for organizations that use Managed Triage: validate them, check for duplicates, set severity, talk to researchers and ask the organization when a decision is theirs. Reports you see are unpublished vulnerabilities; keep them inside Unpatched.";

/**
 * Invites an analyst by email. With an account already, they become an analyst now and are told
 * how to start; without one, they get a 14-day link to create their account and join. `emailed`
 * says whether the provider accepted the message, so the admin is never told "sent" falsely.
 */
export async function addAnalystAction(email: string): Promise<Result & { emailed?: boolean; mode?: "added" | "invited" }> {
  const p = z.string().trim().toLowerCase().email("Enter the analyst's email address.").safeParse(email);
  if (!p.success) return bad(p.error.issues[0]?.message);
  // Only the hash is stored; the token itself exists only in the emailed link.
  const token = randomBytes(32).toString("base64url");
  let mode: "added" | "invited" | undefined;
  const result = await run(["/platform/managed-triage"], async () => {
    mode = await inviteAnalyst(p.data, hashToken(token));
  });
  if (!result.ok || !mode) return result;
  const emailed = await sendInvitationEmail(
    mode === "added"
      ? {
          to: p.data,
          subject: "You're now an Unpatched triage analyst",
          idempotencyKey: `triage-analyst-added-${hashToken(token).slice(0, 16)}`,
          text: [
            "Hello,",
            "",
            `Unpatched has added you as a Managed Triage analyst. ${ROLE_TEXT}`,
            "",
            "To start:",
            `1. Sign in: ${invitationUrl("/sign-in")}`,
            `2. Turn on two-factor authentication (required for analysts): ${invitationUrl("/settings/security")}`,
            `3. Sign out and back in, then open your triage queue: ${invitationUrl("/triage")}`,
          ].join("\n"),
        }
      : {
          to: p.data,
          subject: "You're invited to join Unpatched as a triage analyst",
          idempotencyKey: `triage-analyst-invite-${hashToken(token).slice(0, 16)}`,
          text: [
            "Hello,",
            "",
            `Unpatched has invited you to join as a Managed Triage analyst. ${ROLE_TEXT}`,
            "",
            "Create your account and join (link valid for 14 days, single use):",
            invitationUrl(`/triage/join/${token}`),
            "",
            "After that, turn on two-factor authentication when asked; the triage queue opens once it's on.",
            "If you weren't expecting this, you can ignore this email.",
          ].join("\n"),
        },
  );
  return { ok: true, emailed, mode };
}

export async function revokeAnalystInvitationAction(invitationId: string): Promise<Result> {
  if (!id.safeParse(invitationId).success) return bad();
  return run(["/platform/managed-triage"], () => revokeAnalystInvitation(invitationId));
}

const TOKEN = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Signed in with the invited email: become an analyst. */
export async function acceptAnalystInvitationAction(token: string): Promise<Result> {
  if (!TOKEN.safeParse(token).success) return bad("This invitation link is not valid.");
  return run(["/triage"], () => acceptAnalystInvitation(hashToken(token)));
}

const joinSchema = z.object({
  token: TOKEN,
  name: z.string().trim().min(1, "Enter your name.").max(100),
  password: z.string().max(1000),
  confirm: z.string(),
});

/** No account yet: create it from the invitation (the emailed link proves the email), then sign in. */
export async function joinAsAnalystAction(input: z.input<typeof joinSchema>): Promise<Result> {
  const p = joinSchema.safeParse(input);
  if (!p.success) return bad(p.error.issues[0]?.message ?? "This invitation link is not valid.");
  const problem = passwordProblem(p.data.password);
  if (problem) return bad(problem);
  if (p.data.password !== p.data.confirm) return bad("The passwords don't match.");
  let userId: string | undefined;
  const result = await run([], async () => {
    userId = await redeemAnalystInvitation(hashToken(p.data.token), await hashPassword(p.data.password), p.data.name);
  });
  if (!result.ok || !userId) return result;
  await establishSessionForUser(userId);
  return { ok: true };
}
export async function removeAnalystAction(userId: string): Promise<Result> {
  if (!id.safeParse(userId).success) return bad();
  return run(["/platform/managed-triage"], () => removeAnalyst(userId));
}
