"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { LOGO_MAX_BYTES, removeOrganizationLogo, setOrganizationLogo } from "@/services/organization-logos";

type Result = { ok: true } | { ok: false; message: string };

const orgId = z.string().uuid();

async function run(organizationId: string, work: () => Promise<void>): Promise<Result> {
  try {
    await work();
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  // The logo shows on the organization's pages and wherever its programs are listed.
  revalidatePath(`/organizations/${organizationId}`, "layout");
  revalidatePath("/programs");
  return { ok: true };
}

/** Upload from Organization settings. The file's real type is read from its bytes on the
 * server (setOrganizationLogo); the browser's name and MIME type are never trusted. */
export async function uploadOrganizationLogoAction(formData: FormData): Promise<Result> {
  const parsed = orgId.safeParse(formData.get("organizationId"));
  const file = formData.get("logo");
  if (!parsed.success || !(file instanceof File)) return { ok: false, message: "Choose an image to upload." };
  if (file.size > LOGO_MAX_BYTES) return { ok: false, message: "The image must be 256 KB or smaller." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  return run(parsed.data, () => setOrganizationLogo(parsed.data, bytes));
}

export async function removeOrganizationLogoAction(organizationId: string): Promise<Result> {
  const parsed = orgId.safeParse(organizationId);
  if (!parsed.success) return { ok: false, message: "Check the request and try again." };
  return run(parsed.data, () => removeOrganizationLogo(parsed.data));
}
