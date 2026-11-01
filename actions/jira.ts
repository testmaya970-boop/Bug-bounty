"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { createJiraConnection, deleteJiraConnection, updateJiraConnection } from "@/services/jira";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withRequestLogging } from "@/lib/request-context";

// Client-side shape checks only, for friendly messages; the RPCs re-validate everything
// (site host, key format, token shape) and are the real boundary.
const fields = {
  organizationId: z.string().uuid(),
  accountEmail: z.string().trim().email("Enter the email of the Jira account that owns the token.").max(254),
  projectKey: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,9}$/, "Use the project key as shown in Jira, e.g. SEC."),
  issueTypeName: z.string().trim().min(1, "Enter an issue type, e.g. Bug.").max(60),
};

const createSchema = z.object({
  ...fields,
  siteUrl: z.string().trim().max(200),
  apiToken: z.string().trim().min(1, "Paste the Jira API token.").max(512),
});

const updateSchema = z.object({ ...fields, apiToken: z.string().trim().max(512) });

function settingsPath(organizationId: string) {
  return `/organizations/${organizationId}/settings`;
}

function fail(error: unknown) {
  if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
  throw error;
}

export async function createJiraConnectionAction(input: z.input<typeof createSchema>) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const user = await getCurrentUser();
  try {
    const { organizationId, ...connection } = parsed.data;
    const result = await withRequestLogging("jira.connect", { actorId: user?.id }, () => createJiraConnection(organizationId, connection));
    revalidatePath(settingsPath(organizationId));
    return { ok: true as const, data: result };
  } catch (error) {
    return fail(error);
  }
}

export async function updateJiraConnectionAction(input: z.input<typeof updateSchema>) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const user = await getCurrentUser();
  try {
    const { organizationId, ...connection } = parsed.data;
    await withRequestLogging("jira.update", { actorId: user?.id }, () => updateJiraConnection(organizationId, connection));
    revalidatePath(settingsPath(organizationId));
    return { ok: true as const, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteJiraConnectionAction(input: { organizationId: string }) {
  const parsed = z.object({ organizationId: fields.organizationId }).safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: "Invalid organization." };
  const user = await getCurrentUser();
  try {
    await withRequestLogging("jira.disconnect", { actorId: user?.id }, () => deleteJiraConnection(parsed.data.organizationId));
    revalidatePath(settingsPath(parsed.data.organizationId));
    return { ok: true as const, data: null };
  } catch (error) {
    return fail(error);
  }
}
