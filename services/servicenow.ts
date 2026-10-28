import "server-only";
import { randomBytes } from "node:crypto";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNativeEnv } from "@/lib/env";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { UnsafeUrlError } from "@/lib/integrations/safe-fetch";
import { checkInstanceUrl, checkServiceNow, createServiceNowRecord, ServiceNowError, type ServiceNowCreds } from "@/lib/integrations/servicenow";

// ServiceNow remediation tickets (202610290005).

export type ServiceNowConnection = { instanceUrl: string; username: string; tableName: "incident" | "sn_si_incident"; assignmentGroup: string | null; lastError: string | null };
export type ServiceNowLink = { number: string; url: string; state: "open" | "closed" };

async function asActor<T>(fn: Parameters<typeof withActorTransaction<T>>[1]): Promise<T> {
  const actor = await getCurrentUser();
  if (!actor) throw new OrganizationServiceError("Sign in again to continue.", "AUTH_REQUIRED");
  try {
    return await withActorTransaction(actor.id, fn);
  } catch (error) {
    mapError(error as { message: string });
  }
}

const providerError = (e: unknown) =>
  e instanceof ServiceNowError || e instanceof UnsafeUrlError ? new OrganizationServiceError(e.message, "PROVIDER_ERROR") : new OrganizationServiceError("ServiceNow could not be reached. Try again in a minute.", "PROVIDER_ERROR");

export const servicenowWebhookUrl = (organizationId: string) => `${getNativeEnv().APP_ORIGIN.replace(/\/$/, "")}/api/webhooks/servicenow/${organizationId}`;

export async function getServiceNowConnection(organizationId: string): Promise<ServiceNowConnection | null> {
  type Row = { instance_url: string; username: string; table_name: ServiceNowConnection["tableName"]; assignment_group: string | null; last_error: string | null };
  const r = await asActor((c) => c.query<Row>("select instance_url, username, table_name, assignment_group, last_error from public.servicenow_connections where organization_id = $1", [organizationId]).then((x) => x.rows[0]));
  return r ? { instanceUrl: r.instance_url, username: r.username, tableName: r.table_name, assignmentGroup: r.assignment_group, lastError: r.last_error } : null;
}

/** Tests the credentials against the instance before saving. Returns the inbound token, shown once. */
export async function saveServiceNowConnection(organizationId: string, input: { instanceUrl: string; username: string; password: string; tableName: "incident" | "sn_si_incident"; assignmentGroup: string }): Promise<string> {
  const ok = await asActor((c) => c.query<{ ok: boolean }>("select private.has_org_role($1, array['owner', 'security_admin']::public.organization_member_role[]) as ok", [organizationId]).then((r) => r.rows[0]?.ok === true));
  if (!ok) throw new OrganizationServiceError("Only an owner or security admin can manage integrations.", "FORBIDDEN");
  let instance: string;
  try {
    instance = checkInstanceUrl(input.instanceUrl);
    await checkServiceNow({ instance_url: instance, username: input.username.trim(), password: input.password, table_name: input.tableName, assignment_group: null });
  } catch (error) {
    throw providerError(error);
  }
  const secret = randomBytes(24).toString("hex");
  await asActor((c) => callRpc(c, "public.save_servicenow_connection", [organizationId, instance, input.username, input.password, input.tableName, input.assignmentGroup, secret]));
  return secret;
}

export async function deleteServiceNowConnection(organizationId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.delete_servicenow_connection", [organizationId]));
}

type Creds = ServiceNowCreds & { webhook_secret: string; created_by: string };
export async function servicenowCredentials(organizationId: string): Promise<Creds | null> {
  const [row] = await withServiceRoleTransaction((c) => callRpc<Creds>(c, "private.servicenow_credentials", [organizationId]));
  return row ?? null;
}

/** Triage staff (RLS). The record link uses the instance URL only an admin can read, so it is
 * looked up as the service role after RLS has already allowed the link itself. */
export async function getReportServiceNowLink(reportId: string): Promise<ServiceNowLink | null> {
  type Row = { number: string; sys_id: string; table_name: string; state: "open" | "closed"; organization_id: string };
  const r = await asActor((c) => c.query<Row>("select number, sys_id, table_name, state, organization_id from public.report_servicenow_links where report_id = $1", [reportId]).then((x) => x.rows[0]));
  if (!r) return null;
  const instance = await withServiceRoleTransaction((c) => c.query<{ instance_url: string }>("select instance_url from public.servicenow_connections where organization_id = $1", [r.organization_id]).then((x) => x.rows[0]?.instance_url));
  return { number: r.number, url: instance ? `${instance}/nav_to.do?uri=${r.table_name}.do?sys_id=${r.sys_id}` : "", state: r.state };
}

type Begin = { organization_id: string; program_id: string; program_name: string; title: string; description: string; impact: string | null; severity: string | null; target: string };

export async function createServiceNowTicket(reportId: string): Promise<void> {
  const actor = await getCurrentUser();
  if (!actor) throw new OrganizationServiceError("Sign in again to continue.", "AUTH_REQUIRED");
  const [b] = await asActor((c) => callRpc<Begin>(c, "public.begin_servicenow_record", [reportId]));
  const creds = await servicenowCredentials(b.organization_id);
  if (!creds) throw new OrganizationServiceError("Connect ServiceNow in Integrations first.", "NOT_CONNECTED");
  const link = `${getNativeEnv().APP_ORIGIN.replace(/\/$/, "")}/organizations/${b.organization_id}/programs/${b.program_id}/reports/${reportId}`;
  try {
    const rec = await createServiceNowRecord(creds, {
      title: b.title,
      severity: b.severity,
      correlationId: reportId,
      description: [`Severity: ${b.severity ?? "not set"}`, `Target: ${b.target}`, `Program: ${b.program_name}`, `Report: ${link}`, "", b.description, ...(b.impact ? ["", "Impact:", b.impact] : [])].join("\n"),
    });
    await withServiceRoleTransaction((c) => callRpc(c, "private.record_servicenow_link", [reportId, rec.sysId, rec.number, actor.id]));
  } catch (error) {
    if (error instanceof OrganizationServiceError) throw error;
    const e = providerError(error);
    await withServiceRoleTransaction((c) => callRpc(c, "private.record_servicenow_error", [b.organization_id, e.message])).catch(() => null);
    throw e;
  }
}

/** Inbound (verified): the record was resolved or closed in ServiceNow. */
export async function applyServiceNowState(organizationId: string, sysId: string, closed: boolean): Promise<void> {
  type L = { report_id: string; report_status: string; created_by: string; number: string };
  const link = await withServiceRoleTransaction((c) =>
    c
      .query<L>(
        `update public.report_servicenow_links l set state = $3 from public.reports r, public.servicenow_connections k
          where l.organization_id = $1 and l.sys_id = $2 and r.id = l.report_id and k.organization_id = l.organization_id
          returning l.report_id, r.status as report_status, k.created_by, l.number`,
        [organizationId, sysId, closed ? "closed" : "open"],
      )
      .then((r) => r.rows[0]),
  );
  if (link && closed && link.report_status === "accepted") {
    await withActorTransaction(link.created_by, (c) => callRpc(c, "public.resolve_report", [link.report_id, `Fixed: ServiceNow ${link.number} was resolved.`]), { sessionId: "" }).catch(() => null);
  }
}

/** Whether the report page should offer a ticket: any triage staff member may ask (the
 * connection's details stay admin-only). */
export async function organizationHasServiceNow(organizationId: string): Promise<boolean> {
  const r = await withServiceRoleTransaction((c) => c.query("select 1 from public.servicenow_connections where organization_id = $1", [organizationId]).then((x) => x.rowCount ?? 0));
  return r > 0;
}
