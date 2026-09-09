"use server";

import { z } from "zod";
import { OrganizationServiceError, getOrganizationAuditActivity } from "@/services/organization-members";
import type { OrganizationAuditEventRecord } from "@/types/organization";
import type { Page } from "@/types/pagination";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const listActivitySchema = z.object({ organizationId: z.string().uuid(), cursor: z.string().optional() });

/** Hactivity's "Load more" action -- same shape as actions/notifications.ts's
 * listNotificationsPageAction, scoped by organizationId since this reads
 * getOrganizationAuditActivity rather than a self-scoped query. RLS on audit_logs (owner/
 * security_admin of the given organization only) is the actual access control here; a
 * non-admin/wrong-org caller gets zero rows back, not a thrown error -- see
 * tests/unit/organization-activity-service.test.ts. */
export async function listOrganizationActivityPageAction(input: { organizationId: string; cursor?: string }): Promise<ActionResult<Page<OrganizationAuditEventRecord>>> {
  const parsed = listActivitySchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: "Check the request and try again." };
  return toResult(getOrganizationAuditActivity(parsed.data.organizationId, parsed.data.cursor));
}
