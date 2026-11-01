"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import * as svc from "@/services/org-integrations";

// Shape checks only; roles, limits and the event catalog are enforced by the database.

type Result = { ok: true; secret?: string; url?: string } | { ok: false; message: string };
const id = z.string().uuid();
const kind = z.enum(["webhook", "slack", "teams"]);

async function run(organizationId: string, work: () => Promise<Omit<Extract<Result, { ok: true }>, "ok"> | void>): Promise<Result> {
  let extra;
  try {
    extra = await work();
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath(`/organizations/${organizationId}/integrations`, "layout");
  return { ok: true, ...(extra ?? {}) };
}

const invalid = (e: z.ZodError): Result => ({ ok: false, message: e.issues[0]?.message ?? "Check the form and try again." });

const webhookSchema = z.object({
  organizationId: id,
  url: z.string().trim().min(8, "Enter the endpoint URL.").max(2000),
  description: z.string().trim().max(200),
  eventTypes: z.array(z.string()).min(1, "Choose at least one event."),
  programId: id.nullable(),
});

export async function createWebhookAction(input: z.input<typeof webhookSchema>) {
  const p = webhookSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(p.data.organizationId, async () => ({ secret: await svc.createWebhookEndpoint(p.data.organizationId, p.data) }));
}

export async function updateWebhookAction(input: z.input<typeof webhookSchema> & { endpointId: string; status: "active" | "paused" }) {
  const p = webhookSchema.extend({ endpointId: id, status: z.enum(["active", "paused"]) }).safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(p.data.organizationId, () => svc.updateWebhookEndpoint(p.data.endpointId, p.data));
}

export async function rotateWebhookSecretAction(organizationId: string, endpointId: string) {
  if (!id.safeParse(organizationId).success || !id.safeParse(endpointId).success) return { ok: false, message: "Check the request and try again." } as const;
  return run(organizationId, async () => ({ secret: await svc.rotateWebhookSecret(endpointId) }));
}

export async function deleteIntegrationTargetAction(organizationId: string, targetKind: string, targetId: string) {
  const p = z.object({ organizationId: id, targetKind: kind, targetId: id }).safeParse({ organizationId, targetKind, targetId });
  if (!p.success) return invalid(p.error);
  return run(p.data.organizationId, () => svc.deleteIntegrationTarget(p.data.targetKind, p.data.targetId));
}

export async function testIntegrationAction(organizationId: string, targetKind: string, targetId: string) {
  const p = z.object({ organizationId: id, targetKind: kind, targetId: id }).safeParse({ organizationId, targetKind, targetId });
  if (!p.success) return invalid(p.error);
  return run(p.data.organizationId, () => svc.queueIntegrationTest(p.data.targetKind, p.data.targetId));
}

export async function replayDeliveryAction(organizationId: string, deliveryId: string) {
  if (!id.safeParse(organizationId).success || !id.safeParse(deliveryId).success) return { ok: false, message: "Check the request and try again." } as const;
  return run(organizationId, () => svc.replayDelivery(deliveryId));
}

const alerts = z.array(z.enum(["new_report", "critical", "status_change", "sla_breach"])).min(1, "Choose at least one alert.");

export async function createChatConnectionAction(input: { organizationId: string; provider: "slack" | "teams"; label: string; url: string; alerts: string[]; programId: string | null }) {
  const p = z.object({ organizationId: id, provider: z.enum(["slack", "teams"]), label: z.string().trim().min(1, "Name this connection.").max(120), url: z.string().trim().min(8, "Paste the URL.").max(2000), alerts, programId: id.nullable() }).safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(p.data.organizationId, () => svc.createChatConnection(p.data.organizationId, p.data));
}

export async function updateChatConnectionAction(input: { organizationId: string; connectionId: string; alerts: string[]; programId: string | null; status: "active" | "paused" }) {
  const p = z.object({ organizationId: id, connectionId: id, alerts, programId: id.nullable(), status: z.enum(["active", "paused"]) }).safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(p.data.organizationId, () => svc.updateChatConnection(p.data.connectionId, p.data));
}

export async function startSlackInstallAction(organizationId: string) {
  if (!id.safeParse(organizationId).success) return { ok: false, message: "Check the request and try again." } as const;
  try {
    return { ok: true, url: await svc.startSlackInstall(organizationId) } as const;
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message } as const;
    throw error;
  }
}
