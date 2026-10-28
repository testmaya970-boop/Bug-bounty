import { withServiceRoleTransaction, callRpc } from "../outbox/db-pool";
import { RetryableHandlerError } from "../outbox/registry";
import { closeServiceNowRecord, type ServiceNowCreds } from "@/lib/integrations/servicenow";
import type { OutboxEvent } from "@/types/outbox";

// When a report closes in Unpatched, its ServiceNow ticket gets a work note (and an incident is
// resolved). A no-op without a linked ticket; idempotent: only open links are touched.

const NOTES: Record<string, string> = {
  "report.resolved": "The report was marked resolved in Unpatched.",
  "report.duplicate": "The report was closed in Unpatched as a duplicate.",
  "report.informative": "The report was closed in Unpatched as informative.",
  "report.not_applicable": "The report was closed in Unpatched as not applicable.",
  "report.rejected": "The report was closed in Unpatched as rejected.",
};
export const SERVICENOW_SYNC_EVENT_TYPES = Object.keys(NOTES);

export async function handleServiceNowSync(event: OutboxEvent): Promise<void> {
  const reportId = (event.payload.report_id as string | undefined) ?? event.aggregateId;
  const link = await withServiceRoleTransaction((c) =>
    c.query<{ organization_id: string; sys_id: string }>("select organization_id, sys_id from public.report_servicenow_links where report_id = $1 and state = 'open'", [reportId]).then((r) => r.rows[0]),
  );
  if (!link) return;
  const [creds] = await withServiceRoleTransaction((c) => callRpc<ServiceNowCreds>(c, "private.servicenow_credentials", [link.organization_id]));
  if (!creds) return;
  try {
    await closeServiceNowRecord(creds, link.sys_id, NOTES[event.eventType], event.eventType === "report.resolved");
    await withServiceRoleTransaction((c) => c.query("update public.report_servicenow_links set state = 'closed' where report_id = $1", [reportId]));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await withServiceRoleTransaction((c) => callRpc(c, "private.record_servicenow_error", [link.organization_id, message])).catch(() => null);
    throw new RetryableHandlerError(`servicenow sync failed: ${message}`);
  }
}
