"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { createServiceNowTicket, deleteServiceNowConnection, saveServiceNowConnection } from "@/services/servicenow";

type Result = { ok: true; secret?: string } | { ok: false; message: string };
const id = z.string().uuid();

async function run(paths: string[], work: () => Promise<{ secret?: string } | void>): Promise<Result> {
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

const schema = z.object({
  organizationId: id,
  instanceUrl: z.string().trim().min(8, "Enter your instance address.").max(300),
  username: z.string().trim().min(1, "Enter the integration user.").max(120),
  password: z.string().min(1, "Enter the password.").max(512),
  tableName: z.enum(["incident", "sn_si_incident"]),
  assignmentGroup: z.string().trim().max(120),
});

export async function saveServiceNowAction(input: z.input<typeof schema>): Promise<Result> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Check the form." };
  return run([`/organizations/${p.data.organizationId}/integrations`], async () => ({ secret: await saveServiceNowConnection(p.data.organizationId, p.data) }));
}

export async function deleteServiceNowAction(organizationId: string): Promise<Result> {
  if (!id.safeParse(organizationId).success) return { ok: false, message: "Check the request and try again." };
  return run([`/organizations/${organizationId}/integrations`], () => deleteServiceNowConnection(organizationId));
}

export async function createServiceNowTicketAction(organizationId: string, programId: string, reportId: string): Promise<Result> {
  if (![organizationId, programId, reportId].every((v) => id.safeParse(v).success)) return { ok: false, message: "Check the request and try again." };
  return run([`/organizations/${organizationId}/programs/${programId}/reports/${reportId}`], () => createServiceNowTicket(reportId));
}
