import { timingSafeEqual } from "node:crypto";
import { checkOutboundUrl, safeFetch } from "./safe-fetch";

// ServiceNow Table API client (202610290005). Basic auth with the customer's integration user;
// every call through safeFetch. Shared by the app server and the outbox worker.

export class ServiceNowError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export type ServiceNowCreds = { instance_url: string; username: string; password: string; table_name: "incident" | "sn_si_incident"; assignment_group: string | null };

/** Only ServiceNow-hosted instances (and a local fake in end-to-end tests). */
export function checkInstanceUrl(raw: string): string {
  const url = checkOutboundUrl(raw.trim());
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!loopback && !/\.(service-now|servicenowservices)\.com$/.test(url.hostname)) throw new ServiceNowError("Use your instance address, like https://yourcompany.service-now.com.");
  return `${url.protocol}//${url.host}`;
}

async function sn<T>(c: ServiceNowCreds, path: string, init: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {}): Promise<T> {
  const res = await safeFetch(`${c.instance_url}${path}`, {
    method: init.method ?? "GET",
    headers: { accept: "application/json", authorization: `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 || res.status === 403) throw new ServiceNowError("ServiceNow refused the credentials or the user lacks the role for this table.", res.status);
  if (res.status < 200 || res.status >= 300) throw new ServiceNowError(`ServiceNow answered HTTP ${res.status}`, res.status);
  return (res.body ? JSON.parse(res.body) : {}) as T;
}

export async function checkServiceNow(c: ServiceNowCreds): Promise<void> {
  await sn(c, `/api/now/table/${c.table_name}?sysparm_limit=1&sysparm_fields=sys_id`);
}

const SEVERITY_TO_IMPACT: Record<string, string> = { critical: "1", high: "1", medium: "2", low: "3", none: "3" };

export async function createServiceNowRecord(c: ServiceNowCreds, input: { title: string; description: string; severity: string | null; correlationId: string }): Promise<{ sysId: string; number: string }> {
  const level = SEVERITY_TO_IMPACT[input.severity ?? ""] ?? "2";
  const body: Record<string, string> = {
    short_description: `[Unpatched] ${input.title}`.slice(0, 160),
    description: input.description,
    impact: level,
    urgency: level,
    correlation_id: input.correlationId,
    correlation_display: "Unpatched",
  };
  if (c.assignment_group) body.assignment_group = c.assignment_group;
  const r = await sn<{ result: { sys_id: string; number: string } }>(c, `/api/now/table/${c.table_name}?sysparm_fields=sys_id,number`, { method: "POST", body });
  if (!/^[0-9a-f]{32}$/.test(r.result?.sys_id ?? "")) throw new ServiceNowError("ServiceNow did not return the new record.");
  return { sysId: r.result.sys_id, number: r.result.number };
}

/** Adds a work note; for an incident also resolves it (state 6 needs a close code and notes). */
export async function closeServiceNowRecord(c: ServiceNowCreds, sysId: string, note: string, resolve: boolean): Promise<void> {
  const body: Record<string, string> = { work_notes: note };
  if (resolve && c.table_name === "incident") Object.assign(body, { state: "6", close_code: "Solved (Permanently)", close_notes: note });
  await sn(c, `/api/now/table/${c.table_name}/${sysId}`, { method: "PATCH", body });
}

export function verifyServiceNowToken(secret: string, header: string | null): boolean {
  if (!header) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The Business Rule the customer adds (after update, on the table, when State changes to
 * Resolved or Closed) so a fix in ServiceNow resolves the report in Unpatched. */
export function businessRuleScript(webhookUrl: string): string {
  return `(function executeRule(current, previous) {
  if (current.correlation_display != 'Unpatched') return;
  var r = new sn_ws.RESTMessageV2();
  r.setEndpoint('${webhookUrl}');
  r.setHttpMethod('post');
  r.setRequestHeader('Content-Type', 'application/json');
  r.setRequestHeader('X-Unpatched-Token', gs.getProperty('unpatched.webhook_token'));
  r.setRequestBody(JSON.stringify({ sys_id: current.getUniqueValue(), state: current.state.getDisplayValue() }));
  r.executeAsync();
})(current, previous);`;
}
