"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { createOrganization, updateOrganizationDescription } from "@/services/organizations";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withRequestLogging } from "@/lib/request-context";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, "Enter an organization name.").max(160, "Use 160 characters or fewer."),
  idempotencyKey: z.string().uuid().optional(),
});

export async function createOrganizationAction(input: { name: string; idempotencyKey?: string }) {
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const user = await getCurrentUser();
  try {
    const organization = await withRequestLogging("organization.create", { actorId: user?.id }, () => createOrganization(parsed.data.name, parsed.data.idempotencyKey));
    revalidatePath("/organizations");
    return { ok: true as const, data: organization };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

const updateOrganizationDescriptionSchema = z.object({
  organizationId: z.string().uuid(),
  description: z.string().max(2000, "Use 2000 characters or fewer."),
});

export async function updateOrganizationDescriptionAction(input: { organizationId: string; description: string }) {
  const parsed = updateOrganizationDescriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const user = await getCurrentUser();
  try {
    await withRequestLogging("organization.update_description", { actorId: user?.id }, () =>
      updateOrganizationDescription(parsed.data.organizationId, parsed.data.description),
    );
    revalidatePath(`/organizations/${parsed.data.organizationId}/settings`);
    return { ok: true as const, data: null };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}
