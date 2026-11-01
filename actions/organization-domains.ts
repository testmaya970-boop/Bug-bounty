"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { addOrganizationDomain, checkOrganizationDomain, removeOrganizationDomain } from "@/services/organization-domains";

type Result = { ok: true; verified?: boolean; message?: string } | { ok: false; message: string };

const uuid = z.string().uuid();

async function run(organizationId: string, work: () => Promise<Omit<Extract<Result, { ok: true }>, "ok"> | void>): Promise<Result> {
  if (!uuid.safeParse(organizationId).success) return { ok: false, message: "Check the request and try again." };
  let extra;
  try {
    extra = await work();
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  // Verifying or removing a domain changes which scope entries authorize testing.
  revalidatePath(`/organizations/${organizationId}`, "layout");
  return { ok: true, ...extra };
}

export async function addOrganizationDomainAction(organizationId: string, domain: string): Promise<Result> {
  if (typeof domain !== "string" || domain.length > 300) return { ok: false, message: "Enter a domain like example.com." };
  return run(organizationId, async () => {
    await addOrganizationDomain(organizationId, domain);
  });
}

export async function checkOrganizationDomainAction(organizationId: string, domainId: string): Promise<Result> {
  if (!uuid.safeParse(domainId).success) return { ok: false, message: "Check the request and try again." };
  return run(organizationId, async () => {
    const d = await checkOrganizationDomain(domainId);
    return { verified: d.status === "verified", message: d.status === "verified" ? undefined : (d.lastCheckError ?? undefined) };
  });
}

export async function removeOrganizationDomainAction(organizationId: string, domainId: string): Promise<Result> {
  if (!uuid.safeParse(domainId).success) return { ok: false, message: "Check the request and try again." };
  return run(organizationId, () => removeOrganizationDomain(domainId));
}
