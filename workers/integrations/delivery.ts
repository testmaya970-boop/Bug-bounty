import { withServiceRoleTransaction, callRpc } from "../outbox/db-pool";
import { PermanentHandlerError } from "../outbox/registry";
import { safeFetch, UnsafeUrlError, checkOutboundUrl } from "@/lib/integrations/safe-fetch";
import { webhookHeaders } from "@/lib/integrations/webhook-signature";
import { chatUrlHostAllowed, slackMessage, teamsMessage, type DeliveryPayload } from "@/lib/integrations/chat-messages";
import type { OutboxEvent } from "@/types/outbox";

// The integration delivery engine (202610290001), run by the outbox worker process:
//   - an outbox handler turns each event into one delivery per subscribed target
//     (private.enqueue_integration_deliveries, idempotent per event);
//   - a loop claims due deliveries, sends them through safeFetch (SSRF rules), and completes
//     them: success, retry with backoff, or failed for good;
//   - every few minutes it asks the database for SLA breaches, which become events too.

export const INTEGRATION_EVENT_TYPES = [
  "report.created", "report.triage_started", "report.needs_information", "report.accepted", "report.resolved", "report.duplicate",
  "report.informative", "report.not_applicable", "report.rejected", "report.message_posted", "report.sla_breached",
  "bounty.finalized", "bounty.bonus_approved", "payment.succeeded", "payment.failed",
] as const;

/** Outbox handler: fan the event out to every subscribed endpoint and chat connection. */
export async function handleIntegrationFanout(event: OutboxEvent): Promise<void> {
  try {
    await withServiceRoleTransaction((client) => callRpc(client, "private.enqueue_integration_deliveries", [event.id]));
  } catch (error) {
    // The event row always exists when its own handler runs; anything else is a bug, not a blip.
    if (error instanceof Error && /violates|invalid input/i.test(error.message)) throw new PermanentHandlerError(error.message);
    throw error;
  }
}

type Delivery = { id: string; target_kind: "webhook" | "slack" | "teams"; message_id: string; payload: DeliveryPayload; attempts: number };
type Target = { target_kind: string; url: string | null; secrets: string[] | null; target_status: string | null };
type Outcome = { success: boolean; permanent: boolean; status: number | null; error: string | null; excerpt: string | null; durationMs: number | null };

function appOrigin(): string {
  return (process.env.APP_ORIGIN ?? "").replace(/\/$/, "");
}

export async function sendDelivery(d: Delivery, target: Target, nowSeconds = Math.floor(Date.now() / 1000)): Promise<Outcome> {
  if (!target.url || target.target_status === null) return { success: false, permanent: true, status: null, error: "The endpoint was removed.", excerpt: null, durationMs: null };
  if (target.target_status === "disabled") return { success: false, permanent: true, status: null, error: "The endpoint is disabled.", excerpt: null, durationMs: null };
  let body: string;
  let headers: Record<string, string>;
  try {
    const url = checkOutboundUrl(target.url);
    if (d.target_kind === "webhook") {
      body = JSON.stringify(d.payload);
      headers = webhookHeaders(target.secrets ?? [], d.message_id, nowSeconds, body);
    } else {
      const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
      if (!loopback && !chatUrlHostAllowed(d.target_kind, url)) throw new UnsafeUrlError(`That isn't a ${d.target_kind === "slack" ? "Slack" : "Teams Workflows"} URL.`);
      body = JSON.stringify(d.target_kind === "slack" ? slackMessage(d.payload, appOrigin()) : teamsMessage(d.payload, appOrigin()));
      headers = { "content-type": "application/json" };
    }
  } catch (error) {
    return { success: false, permanent: true, status: null, error: error instanceof Error ? error.message : String(error), excerpt: null, durationMs: null };
  }
  try {
    const res = await safeFetch(target.url, { method: "POST", headers, body });
    const success = res.status >= 200 && res.status < 300;
    // A chat URL that is gone (revoked webhook, deleted workflow) will never work again.
    const permanent = !success && (res.status === 410 || (d.target_kind !== "webhook" && [400, 401, 403, 404].includes(res.status)));
    return { success, permanent, status: res.status, error: success ? null : `HTTP ${res.status}`, excerpt: res.body.slice(0, 1000), durationMs: res.durationMs };
  } catch (error) {
    const unsafe = error instanceof UnsafeUrlError || (error as { code?: string }).code === "EUNSAFE";
    return { success: false, permanent: unsafe, status: null, error: error instanceof Error ? error.message : String(error), excerpt: null, durationMs: null };
  }
}

/** Claims and sends one batch. Each delivery holds no database connection while it is sent. */
export async function runDeliveryBatch(limit = 10): Promise<number> {
  const claimed = await withServiceRoleTransaction((client) => callRpc<Delivery>(client, "private.claim_integration_deliveries", [limit, 60]));
  await Promise.allSettled(
    claimed.map(async (d) => {
      const [target] = await withServiceRoleTransaction((client) => callRpc<Target>(client, "private.integration_delivery_target", [d.id]));
      const outcome = await sendDelivery(d, target ?? { target_kind: d.target_kind, url: null, secrets: null, target_status: null });
      await withServiceRoleTransaction((client) =>
        callRpc(client, "private.complete_integration_delivery", [d.id, outcome.success, outcome.permanent, outcome.status, outcome.error, outcome.excerpt, outcome.durationMs]),
      );
    }),
  );
  return claimed.length;
}

export async function scanSlaBreaches(): Promise<number> {
  const [row] = await withServiceRoleTransaction((client) => callRpc<{ scan_sla_breaches: number }>(client, "private.scan_sla_breaches"));
  return row?.scan_sla_breaches ?? 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs beside the outbox loop in the same worker process. */
export async function runIntegrationLoops(options: { signal?: AbortSignal; pollIntervalMs?: number; slaScanEveryMs?: number }): Promise<void> {
  const poll = options.pollIntervalMs ?? 2000;
  const scanEvery = options.slaScanEveryMs ?? 5 * 60_000;
  let lastScan = 0;
  while (!options.signal?.aborted) {
    try {
      if (Date.now() - lastScan > scanEvery) {
        lastScan = Date.now();
        const n = await scanSlaBreaches();
        if (n > 0) console.info(`[integrations] ${n} SLA breach event(s) queued`);
      }
      const sent = await runDeliveryBatch();
      if (sent === 0) await sleep(poll);
    } catch (error) {
      console.error("[integrations] delivery loop failed, retrying", error);
      await sleep(Math.min(poll * 5, 30_000));
    }
  }
}
