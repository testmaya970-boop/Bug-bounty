"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { deleteSsoConnection, rotateScimToken, saveSsoConnection, setSsoState } from "@/services/sso";

type Result = { ok: true; token?: string } | { ok: false; message: string };
const id = z.string().uuid();
const role = z.enum(["security_admin", "program_manager", "triager", "billing_admin"]);

async function run(organizationId: string, work: () => Promise<{ token?: string } | void>): Promise<Result> {
  let extra;
  try {
    extra = await work();
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath(`/organizations/${organizationId}/integrations`, "layout");
  return { ok: true, ...(extra ?? {}) };
}

const schema = z.object({
  organizationId: id,
  idpEntityId: z.string().trim().min(1, "Enter the identity provider's entity ID (issuer).").max(500),
  idpSsoUrl: z.string().trim().url("Enter the identity provider's single sign-on URL.").max(1000),
  idpCertificate: z.string().trim().min(100, "Paste the identity provider's signing certificate.").max(10000),
  allowJit: z.boolean(),
  defaultRole: role,
  roleAttribute: z.string().trim().max(200),
  roleMappings: z.string().max(4000),
});

/** Role mappings arrive as lines "group=role". */
export async function saveSsoAction(input: z.input<typeof schema>): Promise<Result> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Check the form." };
  const mappings: Record<string, string> = {};
  for (const line of p.data.roleMappings.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [group, r] = line.split("=").map((x) => x?.trim());
    if (!group || !role.safeParse(r).success) return { ok: false, message: `Role mapping "${line}": use group=role, with role security_admin, program_manager, triager or billing_admin.` };
    mappings[group] = r!;
  }
  return run(p.data.organizationId, () => saveSsoConnection(p.data.organizationId, { ...p.data, roleMappings: mappings }));
}

export async function setSsoStateAction(organizationId: string, active: boolean, enforced: boolean): Promise<Result> {
  if (!id.safeParse(organizationId).success) return { ok: false, message: "Check the request and try again." };
  return run(organizationId, () => setSsoState(organizationId, active, enforced));
}

export async function rotateScimTokenAction(organizationId: string): Promise<Result> {
  if (!id.safeParse(organizationId).success) return { ok: false, message: "Check the request and try again." };
  return run(organizationId, async () => ({ token: await rotateScimToken(organizationId) }));
}

export async function deleteSsoAction(organizationId: string): Promise<Result> {
  if (!id.safeParse(organizationId).success) return { ok: false, message: "Check the request and try again." };
  return run(organizationId, () => deleteSsoConnection(organizationId));
}
