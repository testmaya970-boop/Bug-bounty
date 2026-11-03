"use server";

import { z } from "zod";
import { createProgramAction, setProgramVisibilityAction, submitProgramForReviewAction, updateProgramDescriptionAction } from "./programs";
import { addScopeEntryAction } from "./scope";
import { createBountyPolicyVersionAction } from "./bounty";
import { publishProgramPolicyAction } from "./program-policy";
import { inviteResearcherByUsernameToProgram } from "./program-researchers";

// The Launch Program Studio's one save: create the program, then apply each step through the
// same actions (and the same authorization and validation) the program page uses. Every step
// reports its own result; a failed step never hides behind an overall "launched".

const range = z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() });
const launchSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(20000),
  programType: z.enum(["bounty", "vdp"]),
  engagementType: z.enum(["bug_bounty", "response", "pentest", "code_audit", "challenge", "campaign", "spot_check"]),
  visibility: z.enum(["public", "private"]),
  scope: z.array(z.object({ assetType: z.enum(["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"]), target: z.string().trim().min(1).max(2048) })).max(200),
  /** Whole currency units per severity, as the studio shows them; stored in minor units. */
  rewards: z.object({ currency: z.enum(["USD", "INR"]), critical: range, high: range, medium: range, low: range, informational: range }).nullable(),
  policy: z.object({
    rulesOfEngagement: z.string().trim().min(1).max(20000),
    safeHarbor: z.boolean(),
    disclosureDays: z.number().int().min(0).max(365),
    firstResponseTargetHours: z.number().int().min(1).max(720),
    triageTargetHours: z.number().int().min(1).max(2160),
    resolutionTargetDays: z.number().int().min(1).max(365),
  }),
  inviteUsernames: z.array(z.string().trim().min(2).max(41)).max(100),
  submitForReview: z.boolean(),
});

export type LaunchStep = { step: string; ok: boolean; message?: string };
export type LaunchResult = { ok: true; programId: string; steps: LaunchStep[]; submitted: boolean } | { ok: false; message: string };

export async function launchProgramFromStudioAction(input: z.infer<typeof launchSchema>): Promise<LaunchResult> {
  const parsed = launchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the studio and try again." };
  const p = parsed.data;
  const ref = { organizationId: p.organizationId };

  const created = await createProgramAction({ ...ref, name: p.name, programType: p.programType, engagementType: p.engagementType });
  if (!created.ok) return { ok: false, message: created.message };
  const programId = created.data.id;
  const steps: LaunchStep[] = [{ step: "Program created as a draft", ok: true }];
  const record = (step: string, result: { ok: boolean; message?: string }) => steps.push({ step, ok: result.ok, message: result.ok ? undefined : result.message });

  if (p.description.trim()) record("Description", await updateProgramDescriptionAction({ ...ref, programId, description: p.description }));
  record(`Visibility: ${p.visibility}`, await setProgramVisibilityAction({ ...ref, programId, visibility: p.visibility }));

  for (const entry of p.scope) {
    const r = await addScopeEntryAction({ ...ref, programId, assetType: entry.assetType, targetInput: entry.target, scopeState: "in_scope" });
    record(`Scope: ${entry.target}`, r.ok ? { ok: true } : { ok: false, message: r.message });
  }

  if (p.rewards) {
    const cents = (r: { min: number; max: number }) => ({ min: r.min * 100, max: r.max * 100 });
    const r = await createBountyPolicyVersionAction({
      ...ref,
      programId,
      currency: p.rewards.currency,
      ranges: { critical: cents(p.rewards.critical), high: cents(p.rewards.high), medium: cents(p.rewards.medium), low: cents(p.rewards.low), none: cents(p.rewards.informational) },
    });
    record("Bounty table", r.ok ? { ok: true } : { ok: false, message: r.message });
  }

  const policy = await publishProgramPolicyAction({ ...ref, programId, ...p.policy, disclosureMode: "coordinated", changeNote: "Published from the Launch Program Studio" });
  record("Policy, safe harbor and SLAs", policy.ok ? { ok: true } : { ok: false, message: policy.message });

  for (const username of p.inviteUsernames) {
    const r = await inviteResearcherByUsernameToProgram({ ...ref, programId, username });
    record(`Invite @${username.replace(/^@/, "")}`, r.ok ? { ok: true } : { ok: false, message: r.message });
  }

  let submitted = false;
  if (p.submitForReview) {
    const r = await submitProgramForReviewAction({ ...ref, programId });
    record("Submitted for launch review", r.ok ? { ok: true } : { ok: false, message: r.message });
    submitted = r.ok;
  }
  return { ok: true, programId, steps, submitted };
}
