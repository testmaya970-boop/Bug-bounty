"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import * as svc from "@/services/code-hosts";

type Result = { ok: true; url?: string; webhookUrl?: string; secret?: string; issueUrl?: string } | { ok: false; message: string };
const id = z.string().uuid();
const provider = z.enum(["github", "gitlab"]);

async function run(paths: string[], work: () => Promise<Omit<Extract<Result, { ok: true }>, "ok"> | void>): Promise<Result> {
  let extra;
  try {
    extra = await work();
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  for (const p of paths) revalidatePath(p, "layout");
  return { ok: true, ...(extra ?? {}) };
}

export async function startGithubInstallAction(organizationId: string): Promise<Result> {
  if (!id.safeParse(organizationId).success) return { ok: false, message: "Check the request and try again." };
  return run([], async () => ({ url: await svc.startGithubInstall(organizationId) }));
}

export async function connectGitlabAction(input: { organizationId: string; baseUrl: string; token: string }): Promise<Result> {
  const p = z.object({ organizationId: id, baseUrl: z.string().trim().max(300), token: z.string().trim().min(16, "Paste a GitLab access token.").max(512) }).safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Check the form." };
  return run([`/organizations/${p.data.organizationId}/integrations`], () => svc.connectGitlab(p.data.organizationId, p.data.baseUrl, p.data.token));
}

export async function disconnectCodeHostAction(organizationId: string, connectionId: string): Promise<Result> {
  if (!id.safeParse(organizationId).success || !id.safeParse(connectionId).success) return { ok: false, message: "Check the request and try again." };
  return run([`/organizations/${organizationId}/integrations`], () => svc.disconnectCodeHost(connectionId));
}

export async function setProgramRepositoryAction(input: { organizationId: string; programId: string; provider: string; repo: string }): Promise<Result> {
  const p = z.object({ organizationId: id, programId: id, provider, repo: z.string().trim().min(1, "Choose a repository.").max(300) }).safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Check the form." };
  return run([`/organizations/${p.data.organizationId}/integrations`], () => svc.setProgramRepository(p.data.organizationId, p.data.programId, p.data.provider, p.data.repo));
}

export async function clearProgramRepositoryAction(organizationId: string, programId: string, prov: string): Promise<Result> {
  const p = z.object({ organizationId: id, programId: id, provider }).safeParse({ organizationId, programId, provider: prov });
  if (!p.success) return { ok: false, message: "Check the request and try again." };
  return run([`/organizations/${organizationId}/integrations`], () => svc.clearProgramRepository(p.data.programId, p.data.provider));
}

export async function createReportIssueAction(organizationId: string, programId: string, reportId: string, prov: string): Promise<Result> {
  const p = z.object({ organizationId: id, programId: id, reportId: id, provider }).safeParse({ organizationId, programId, reportId, provider: prov });
  if (!p.success) return { ok: false, message: "Check the request and try again." };
  return run([`/organizations/${organizationId}/programs/${programId}/reports/${reportId}`], async () => ({ issueUrl: (await svc.createReportIssue(reportId, p.data.provider)).issueUrl }));
}
