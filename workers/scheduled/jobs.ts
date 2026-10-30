import { withServiceRoleTransaction, callRpc } from "../outbox/db-pool";
import { activeEmailProvider } from "@/lib/email-provider";
import { scheduledFilters } from "@/lib/analytics/filters";
import { describeFilters, fetchReportFacts, fetchScopeAssets, narrowScope } from "@/lib/analytics/queries";
import { computeAnalytics } from "@/lib/analytics/report-metrics";
import { buildExport, exportFileName, EXPORT_TYPES, type ExportFormat } from "@/lib/exports/analytics-files";

// Timed jobs beside the outbox loop: scheduled analytics exports (202610290009) and the
// monthly Managed Triage renewal (202610290008).

type Schedule = { id: string; organization_id: string; created_by: string; name: string; format: ExportFormat; frequency: "weekly" | "monthly"; filters: unknown };

const origin = () => (process.env.APP_ORIGIN ?? "").replace(/\/$/, "");

/** Builds one schedule's file as the person who scheduled it; the database re-checks their access. */
export async function runScheduledExport(s: Schedule, now: Date = new Date()): Promise<"ready" | "failed"> {
  const filters = scheduledFilters(s.filters, s.frequency, now);
  try {
    const data = await withServiceRoleTransaction(async (c) => {
      const org = (await c.query<{ name: string }>("select name from public.organizations where id = $1", [s.organization_id])).rows[0];
      const programs = (await c.query<{ id: string; name: string }>("select id, name from public.programs where id = any ($1::uuid[])", [filters.programIds])).rows;
      const assets = (await c.query<{ id: string; display_identifier: string }>("select id, display_identifier from public.assets where id = any ($1::uuid[])", [filters.assetIds])).rows;
      await c.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: s.created_by, role: "authenticated" })]);
      await c.query("set local role authenticated");
      const facts = await fetchReportFacts(c, s.organization_id, filters);
      const scope = narrowScope(await fetchScopeAssets(c, s.organization_id, filters.programIds), filters);
      return { org, programs, assets, facts, scope };
    });
    const analytics = computeAnalytics(data.facts, data.scope, { from: filters.from, to: filters.to }, now);
    const meta = {
      organizationName: data.org?.name ?? "Organization",
      generatedAt: now,
      filterSummary: describeFilters(filters, { programs: new Map(data.programs.map((p) => [p.id, p.name])), assets: new Map(data.assets.map((a) => [a.id, a.display_identifier])) }),
    };
    const bytes = buildExport(s.format, analytics, data.facts, meta);
    const fileName = exportFileName(meta.organizationName, s.format, filters);
    const run = await withServiceRoleTransaction(async (c) => {
      const row = (
        await c.query<{ id: string }>(
          "insert into public.analytics_export_runs (schedule_id, organization_id, requested_by, format, period_from, period_to, status, file_name, content) values ($1, $2, $3, $4, $5, $6, 'ready', $7, $8) returning id",
          [s.id, s.organization_id, s.created_by, s.format, filters.from, filters.to, fileName, Buffer.from(bytes)],
        )
      ).rows[0];
      const user = (await c.query<{ email: string; display_name: string | null }>("select email, display_name from public.users where id = $1", [s.created_by])).rows[0];
      return { id: row.id, user };
    });
    if (run.user?.email) {
      await activeEmailProvider.send({
        to: run.user.email,
        subject: `${s.name}: your ${s.frequency} security report is ready`,
        text:
          `Hello${run.user.display_name ? ` ${run.user.display_name}` : ""},\n\n` +
          `Your scheduled ${EXPORT_TYPES[s.format].label} "${s.name}" for ${meta.organizationName} covering ${filters.from} to ${filters.to} is ready.\n\n` +
          `Download it after signing in:\n${origin()}/organizations/${s.organization_id}/analytics/exports/${run.id}\n\n` +
          `The file stays in Unpatched; this email never contains report data. Manage scheduled exports under Analytics > Scheduled exports.\n`,
        idempotencyKey: `analytics-export-${run.id}`,
      });
    }
    return "ready";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The creator lost access (left the organization, role changed): stop the schedule.
    const lostAccess = /FORBIDDEN|not an active member/i.test(message);
    await withServiceRoleTransaction(async (c) => {
      await c.query(
        "insert into public.analytics_export_runs (schedule_id, organization_id, requested_by, format, period_from, period_to, status, error) values ($1, $2, $3, $4, $5, $6, 'failed', $7)",
        [s.id, s.organization_id, s.created_by, s.format, filters.from, filters.to, lostAccess ? "The person who scheduled this export no longer has access to these analytics, so it was stopped." : "The export could not be built. It will be tried again at the next scheduled time."],
      );
      if (lostAccess) await c.query("update public.analytics_export_schedules set active = false where id = $1", [s.id]);
    });
    console.error(`[scheduled] export ${s.id} failed`, message);
    return "failed";
  }
}

export async function runDueExports(now: Date = new Date()): Promise<number> {
  const due = await withServiceRoleTransaction((c) => callRpc<Schedule>(c, "public.claim_due_analytics_exports", [5]));
  for (const s of due) await runScheduledExport(s, now);
  // Stored files are kept 90 days.
  await withServiceRoleTransaction((c) => c.query("delete from public.analytics_export_runs where created_at < now() - interval '90 days'"));
  return due.length;
}

export async function renewManagedTriage(): Promise<number> {
  const rows = await withServiceRoleTransaction((c) => callRpc<{ renew_managed_triage_subscriptions: number }>(c, "public.renew_managed_triage_subscriptions"));
  return rows[0]?.renew_managed_triage_subscriptions ?? 0;
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
});

/** Exports every minute, renewals hourly (a renewal is due once a day per subscription). */
export async function runScheduledJobs(options: { signal?: AbortSignal; everyMs?: number }): Promise<void> {
  let lastRenewal = 0;
  while (!options.signal?.aborted) {
    try {
      if (Date.now() - lastRenewal > 3_600_000) {
        lastRenewal = Date.now();
        const renewed = await renewManagedTriage();
        if (renewed > 0) console.info(`[scheduled] renewed ${renewed} Managed Triage subscription(s)`);
      }
      const ran = await runDueExports();
      if (ran > 0) console.info(`[scheduled] ran ${ran} scheduled export(s)`);
    } catch (error) {
      console.error("[scheduled] job loop failed, retrying", error);
    }
    await sleep(options.everyMs ?? 60_000, options.signal);
  }
}
