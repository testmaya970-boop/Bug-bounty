"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { createExportSchedule, deleteExportSchedule } from "@/services/analytics-explorer";
import { filtersToSaved, parseAnalyticsFilters } from "@/lib/analytics/filters";

type Result = { ok: true } | { ok: false; message: string };

async function run(organizationId: string, work: () => Promise<void>): Promise<Result> {
  try {
    await work();
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath(`/organizations/${organizationId}/analytics/schedules`);
  return { ok: true };
}

const scheduleSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1, "Name the export.").max(120),
  format: z.enum(["csv", "xlsx", "pdf"]),
  frequency: z.enum(["weekly", "monthly"]),
  // The Explore view's query string; re-parsed here, so only valid filters are saved.
  query: z.string().max(8000),
});

export async function createExportScheduleAction(input: z.input<typeof scheduleSchema>): Promise<Result> {
  const p = scheduleSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Check the form." };
  const q = new URLSearchParams(p.data.query);
  const filters = parseAnalyticsFilters({ program: q.getAll("program"), severity: q.getAll("severity"), status: q.getAll("status"), asset: q.getAll("asset") });
  return run(p.data.organizationId, () => createExportSchedule(p.data.organizationId, p.data.name, p.data.format, p.data.frequency, filtersToSaved(filters)));
}

export async function deleteExportScheduleAction(organizationId: string, scheduleId: string): Promise<Result> {
  const ids = z.object({ organizationId: z.string().uuid(), scheduleId: z.string().uuid() }).safeParse({ organizationId, scheduleId });
  if (!ids.success) return { ok: false, message: "Check the request and try again." };
  return run(organizationId, () => deleteExportSchedule(scheduleId));
}
