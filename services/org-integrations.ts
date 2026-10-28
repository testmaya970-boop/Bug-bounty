import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNativeEnv } from "@/lib/env";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { checkOutboundUrl, UnsafeUrlError } from "@/lib/integrations/safe-fetch";
import { generateWebhookSecret } from "@/lib/integrations/webhook-signature";
import { chatTargetHint, chatUrlHostAllowed } from "@/lib/integrations/chat-messages";

// Outbound webhooks and Slack / Teams alerts (202610290001). Every rule (roles, limits, the
// event catalog) is enforced by the database functions; this file adds what only the server can
// do: URL safety checks before saving, generating secrets, and the Slack app install.

export const WEBHOOK_EVENTS = [
  { type: "report.created", label: "Report submitted" },
  { type: "report.triage_started", label: "Triage started" },
  { type: "report.needs_information", label: "More information requested" },
  { type: "report.accepted", label: "Report accepted" },
  { type: "report.resolved", label: "Report resolved" },
  { type: "report.duplicate", label: "Closed as duplicate" },
  { type: "report.informative", label: "Closed as informative" },
  { type: "report.not_applicable", label: "Closed as not applicable" },
  { type: "report.rejected", label: "Report rejected" },
  { type: "report.message_posted", label: "New message on a report" },
  { type: "report.sla_breached", label: "SLA breached" },
  { type: "bounty.finalized", label: "Bounty awarded" },
  { type: "bounty.bonus_approved", label: "Bonus approved" },
  { type: "payment.succeeded", label: "Payout sent" },
  { type: "payment.failed", label: "Payout failed" },
] as const;

export const CHAT_ALERTS = [
  { key: "new_report", label: "New reports" },
  { key: "critical", label: "Critical findings" },
  { key: "status_change", label: "Status changes" },
  { key: "sla_breach", label: "SLA breaches" },
] as const;

export type WebhookEndpoint = { id: string; url: string; description: string | null; eventTypes: string[]; programId: string | null; status: "active" | "paused" | "disabled"; disabledReason: string | null; failureStreak: number; previousSecretValidUntil: string | null; createdAt: string };
export type ChatConnection = { id: string; provider: "slack" | "teams"; label: string; targetHint: string; alerts: string[]; programId: string | null; status: "active" | "paused" | "disabled"; disabledReason: string | null; createdAt: string };
export type Delivery = { id: string; targetKind: string; targetId: string; eventType: string; status: "pending" | "delivering" | "succeeded" | "failed"; attempts: number; maxAttempts: number; nextAttemptAt: string; lastStatusCode: number | null; lastError: string | null; responseExcerpt: string | null; durationMs: number | null; createdAt: string; deliveredAt: string | null; isReplay: boolean };

const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);

async function actorId(): Promise<string> {
  const actor = await getCurrentUser();
  if (!actor) throw new OrganizationServiceError("Sign in again to continue.", "AUTH_REQUIRED");
  return actor.id;
}

async function asActor<T>(fn: Parameters<typeof withActorTransaction<T>>[1]): Promise<T> {
  const id = await actorId();
  try {
    return await withActorTransaction(id, fn);
  } catch (error) {
    mapError(error as { message: string });
  }
}

function safeUrlOrThrow(raw: string): URL {
  try {
    return checkOutboundUrl(raw.trim());
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw new OrganizationServiceError(error.message, "UNSAFE_URL");
    throw error;
  }
}

// Reads (RLS: owner / security admin) ------------------------------------------------------------
export async function listWebhookEndpoints(organizationId: string): Promise<WebhookEndpoint[]> {
  type Row = { id: string; url: string; description: string | null; event_types: string[]; program_id: string | null; status: WebhookEndpoint["status"]; disabled_reason: string | null; failure_streak: number; previous_secret_valid_until: string | null; created_at: string };
  const rows = await asActor((c) =>
    c.query<Row>("select id, url, description, event_types, program_id, status, disabled_reason, failure_streak, previous_secret_valid_until, created_at from public.webhook_endpoints where organization_id = $1 order by created_at", [organizationId]).then((r) => r.rows),
  );
  return rows.map((r) => ({ id: r.id, url: r.url, description: r.description, eventTypes: r.event_types, programId: r.program_id, status: r.status, disabledReason: r.disabled_reason, failureStreak: r.failure_streak, previousSecretValidUntil: iso(r.previous_secret_valid_until), createdAt: iso(r.created_at)! }));
}

export async function listChatConnections(organizationId: string): Promise<ChatConnection[]> {
  type Row = { id: string; provider: ChatConnection["provider"]; label: string; target_hint: string; alerts: string[]; program_id: string | null; status: ChatConnection["status"]; disabled_reason: string | null; created_at: string };
  const rows = await asActor((c) =>
    c.query<Row>("select id, provider, label, target_hint, alerts, program_id, status, disabled_reason, created_at from public.chat_connections where organization_id = $1 order by created_at", [organizationId]).then((r) => r.rows),
  );
  return rows.map((r) => ({ id: r.id, provider: r.provider, label: r.label, targetHint: r.target_hint, alerts: r.alerts, programId: r.program_id, status: r.status, disabledReason: r.disabled_reason, createdAt: iso(r.created_at)! }));
}

export async function listDeliveries(organizationId: string, kinds: string[], limit = 50): Promise<Delivery[]> {
  type Row = { id: string; target_kind: string; target_id: string; event_type: string; status: Delivery["status"]; attempts: number; max_attempts: number; next_attempt_at: string; last_status_code: number | null; last_error: string | null; response_excerpt: string | null; duration_ms: number | null; created_at: string; delivered_at: string | null; replay_of: string | null };
  const rows = await asActor((c) =>
    c
      .query<Row>(
        "select id, target_kind, target_id, event_type, status, attempts, max_attempts, next_attempt_at, last_status_code, last_error, response_excerpt, duration_ms, created_at, delivered_at, replay_of from public.integration_deliveries where organization_id = $1 and target_kind = any($2) order by created_at desc limit $3",
        [organizationId, kinds, Math.min(limit, 200)],
      )
      .then((r) => r.rows),
  );
  return rows.map((r) => ({ id: r.id, targetKind: r.target_kind, targetId: r.target_id, eventType: r.event_type, status: r.status, attempts: r.attempts, maxAttempts: r.max_attempts, nextAttemptAt: iso(r.next_attempt_at)!, lastStatusCode: r.last_status_code, lastError: r.last_error, responseExcerpt: r.response_excerpt, durationMs: r.duration_ms, createdAt: iso(r.created_at)!, deliveredAt: iso(r.delivered_at), isReplay: r.replay_of !== null }));
}

// Webhooks -----------------------------------------------------------------------------------------
export type WebhookInput = { url: string; description: string; eventTypes: string[]; programId: string | null };

/** Returns the signing secret: shown once, never readable again. */
export async function createWebhookEndpoint(organizationId: string, input: WebhookInput): Promise<string> {
  const url = safeUrlOrThrow(input.url).toString();
  const secret = generateWebhookSecret();
  await asActor((c) => callRpc(c, "public.create_webhook_endpoint", [organizationId, url, input.description, input.eventTypes, input.programId, secret]));
  return secret;
}

export async function updateWebhookEndpoint(endpointId: string, input: WebhookInput & { status: "active" | "paused" }): Promise<void> {
  const url = safeUrlOrThrow(input.url).toString();
  await asActor((c) => callRpc(c, "public.update_webhook_endpoint", [endpointId, url, input.description, input.eventTypes, input.programId, input.status]));
}

export async function rotateWebhookSecret(endpointId: string): Promise<string> {
  const secret = generateWebhookSecret();
  await asActor((c) => callRpc(c, "public.rotate_webhook_secret", [endpointId, secret]));
  return secret;
}

export async function deleteIntegrationTarget(kind: "webhook" | "slack" | "teams", targetId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.delete_integration_target", [kind === "webhook" ? "webhook" : "chat", targetId]));
}

export async function queueIntegrationTest(kind: "webhook" | "slack" | "teams", targetId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.queue_integration_test", [kind, targetId]));
}

export async function replayDelivery(deliveryId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.replay_integration_delivery", [deliveryId]));
}

// Chat ------------------------------------------------------------------------------------------------
export async function createChatConnection(organizationId: string, input: { provider: "slack" | "teams"; label: string; url: string; alerts: string[]; programId: string | null }): Promise<void> {
  const url = safeUrlOrThrow(input.url);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!loopback && !chatUrlHostAllowed(input.provider, url)) {
    throw new OrganizationServiceError(input.provider === "slack" ? "Paste a Slack incoming webhook URL (https://hooks.slack.com/services/...)." : "Paste a Teams Workflows URL (from the 'Post to a channel when a webhook request is received' workflow).", "UNSAFE_URL");
  }
  await asActor((c) => callRpc(c, "public.create_chat_connection", [organizationId, input.provider, input.label, url.toString(), chatTargetHint(input.provider, url), input.alerts, input.programId]));
}

export async function updateChatConnection(connectionId: string, input: { alerts: string[]; programId: string | null; status: "active" | "paused" }): Promise<void> {
  await asActor((c) => callRpc(c, "public.update_chat_connection", [connectionId, input.alerts, input.programId, input.status]));
}

// Slack app install (OAuth v2, scope incoming-webhook: Slack asks the installer to pick a channel) ---
export function slackAppConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SLACK_CLIENT_ID?.trim() && env.SLACK_CLIENT_SECRET?.trim());
}

const hashState = (s: string) => createHash("sha256").update(s).digest("hex");
const slackRedirectUri = () => `${getNativeEnv().APP_ORIGIN.replace(/\/$/, "")}/api/integrations/slack/callback`;

export async function startSlackInstall(organizationId: string): Promise<string> {
  if (!slackAppConfigured()) throw new OrganizationServiceError("The Unpatched Slack app isn't set up on this server. Paste an incoming webhook URL instead.", "NOT_AVAILABLE");
  const id = await actorId();
  // Checked here so a non-admin is never sent to Slack; the database checks again on save.
  const allowed = await asActor((c) => c.query<{ ok: boolean }>("select private.has_org_role($1, array['owner', 'security_admin']::public.organization_member_role[]) as ok", [organizationId]).then((r) => r.rows[0]?.ok === true));
  if (!allowed) throw new OrganizationServiceError("Only an owner or security admin can connect Slack.", "FORBIDDEN");
  const state = randomBytes(24).toString("base64url");
  await withServiceRoleTransaction((c) => c.query("insert into public.integration_oauth_states (state_hash, provider, organization_id, user_id) values ($1, 'slack', $2, $3)", [hashState(state), organizationId, id]));
  const params = new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID!, scope: "incoming-webhook", redirect_uri: slackRedirectUri(), state });
  return `https://slack.com/oauth/v2/authorize?${params}`;
}

/** The Slack callback: the state must be one this signed-in user started in the last hour. */
export async function completeSlackInstall(params: URLSearchParams): Promise<{ organizationId: string | null; error: string | null }> {
  const actor = await getCurrentUser();
  const state = params.get("state") ?? "";
  if (!actor || !state) return { organizationId: null, error: "Sign in and start the Slack connection again." };
  const row = await withServiceRoleTransaction((c) =>
    c
      .query<{ organization_id: string }>("delete from public.integration_oauth_states where state_hash = $1 and user_id = $2 and provider = 'slack' and created_at > now() - interval '1 hour' returning organization_id", [hashState(state), actor.id])
      .then((r) => r.rows[0]),
  );
  if (!row) return { organizationId: null, error: "That Slack link expired or was already used. Start again." };
  if (params.get("error")) return { organizationId: row.organization_id, error: "Slack installation was cancelled." };
  const code = params.get("code");
  if (!code || !slackAppConfigured()) return { organizationId: row.organization_id, error: "Slack did not return an authorization code." };

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID!, client_secret: process.env.SLACK_CLIENT_SECRET!, code, redirect_uri: slackRedirectUri() }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string; team?: { name?: string }; incoming_webhook?: { url?: string; channel?: string } } | null;
  const hook = body?.incoming_webhook?.url;
  if (!body?.ok || !hook || !chatUrlHostAllowed("slack", new URL(hook))) return { organizationId: row.organization_id, error: `Slack refused the installation${body?.error ? ` (${body.error})` : ""}.` };
  const label = `${body.team?.name ?? "Slack"} ${body.incoming_webhook?.channel ?? ""}`.trim();
  try {
    await withServiceRoleTransaction((c) => callRpc(c, "private.create_slack_app_connection", [row.organization_id, actor.id, label, hook, chatTargetHint("slack", new URL(hook))]));
  } catch (error) {
    return { organizationId: row.organization_id, error: error instanceof Error ? error.message.replace(/^[A-Z_]+: /, "") : "Could not save the connection." };
  }
  return { organizationId: row.organization_id, error: null };
}
