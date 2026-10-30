import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import { fetchReportFacts, fetchScopeAssets, narrowScope } from "@/lib/analytics/queries";
import type { AnalyticsFilters } from "@/lib/analytics/filters";
import type { ExportFormat } from "@/lib/exports/analytics-files";

// Explore tab + exports + scheduled exports (202610290009). Authorization is in the database
// functions; every call runs as the signed-in user.

async function asActor<T>(fn: Parameters<typeof withActorTransaction<T>>[1]): Promise<T> {
  const actor = await getCurrentUser();
  try {
    return await withActorTransaction(actor?.id ?? null, fn);
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** facts + the in-scope assets the filters cover (coverage denominator) + every in-scope asset (filter options). */
export async function getExploreData(organizationId: string, filters: AnalyticsFilters) {
  return asActor(async (client) => {
    const allAssets = await fetchScopeAssets(client, organizationId, []);
    const programAssets = filters.programIds.length ? await fetchScopeAssets(client, organizationId, filters.programIds) : allAssets;
    return {
      facts: await fetchReportFacts(client, organizationId, filters),
      scopeAssets: narrowScope(programAssets, filters),
      assetOptions: allAssets,
    };
  });
}

export type ExportSchedule = { id: string; name: string; format: ExportFormat; frequency: "weekly" | "monthly"; filters: Record<string, string[]>; nextRunAt: string; lastRunAt: string | null; createdBy: string; createdByName: string | null };
export type ExportRun = { id: string; scheduleName: string | null; format: ExportFormat; periodFrom: string; periodTo: string; status: "ready" | "failed"; fileName: string | null; byteSize: number | null; error: string | null; createdAt: string };

export async function listExportSchedules(organizationId: string): Promise<ExportSchedule[]> {
  const rows = await asActor((c) =>
    c
      .query<{ id: string; name: string; format: ExportFormat; frequency: "weekly" | "monthly"; filters: Record<string, string[]>; next_run_at: Date; last_run_at: Date | null; created_by: string; display_name: string | null }>(
        `select s.id, s.name, s.format, s.frequency, s.filters, s.next_run_at, s.last_run_at, s.created_by, u.display_name
         from public.analytics_export_schedules s left join public.users u on u.id = s.created_by
         where s.organization_id = $1 and s.active order by s.created_at desc`,
        [organizationId],
      )
      .then((r) => r.rows),
  );
  return rows.map((r) => ({ id: r.id, name: r.name, format: r.format, frequency: r.frequency, filters: r.filters, nextRunAt: new Date(r.next_run_at).toISOString(), lastRunAt: r.last_run_at ? new Date(r.last_run_at).toISOString() : null, createdBy: r.created_by, createdByName: r.display_name }));
}

export async function listExportRuns(organizationId: string): Promise<ExportRun[]> {
  const rows = await asActor((c) =>
    c
      .query<{ id: string; name: string | null; format: ExportFormat; period_from: Date; period_to: Date; status: "ready" | "failed"; file_name: string | null; byte_size: number | null; error: string | null; created_at: Date }>(
        `select r.id, s.name, r.format, r.period_from, r.period_to, r.status, r.file_name, octet_length(r.content) as byte_size, r.error, r.created_at
         from public.analytics_export_runs r left join public.analytics_export_schedules s on s.id = r.schedule_id
         where r.organization_id = $1 order by r.created_at desc limit 50`,
        [organizationId],
      )
      .then((r) => r.rows),
  );
  const day = (d: Date) => new Date(d).toISOString().slice(0, 10);
  return rows.map((r) => ({ id: r.id, scheduleName: r.name, format: r.format, periodFrom: day(r.period_from), periodTo: day(r.period_to), status: r.status, fileName: r.file_name, byteSize: r.byte_size, error: r.error, createdAt: new Date(r.created_at).toISOString() }));
}

/** The stored file, if the signed-in user may read it (RLS: who scheduled it, or an org admin). */
export async function getExportRunFile(organizationId: string, runId: string): Promise<{ fileName: string; format: ExportFormat; content: Buffer } | null> {
  const row = await asActor((c) =>
    c
      .query<{ file_name: string; format: ExportFormat; content: Buffer }>("select file_name, format, content from public.analytics_export_runs where id = $1 and organization_id = $2 and status = 'ready'", [runId, organizationId])
      .then((r) => r.rows[0]),
  );
  return row ? { fileName: row.file_name, format: row.format, content: row.content } : null;
}

export async function createExportSchedule(organizationId: string, name: string, format: ExportFormat, frequency: "weekly" | "monthly", filters: Record<string, string[]>): Promise<void> {
  await asActor((c) => callRpc(c, "public.create_analytics_export_schedule", [organizationId, name, format, frequency, JSON.stringify(filters)]));
}

export async function deleteExportSchedule(scheduleId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.delete_analytics_export_schedule", [scheduleId]));
}
