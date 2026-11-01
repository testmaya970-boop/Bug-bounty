export const WEBHOOK_EVENTS = [
  { type: "report.created", label: "Report submitted" },
  { type: "report.triaged", label: "Report moved to triage" },
  { type: "report.accepted", label: "Report accepted" },
  { type: "report.resolved", label: "Report resolved" },
  { type: "report.closed", label: "Report closed (rejected / duplicate)" },
  { type: "bounty.awarded", label: "Bounty awarded" },
  { type: "sla.breached", label: "SLA target missed" },
] as const;

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  eventTypes: string[];
  programId: string | null;
  status: "active" | "paused" | "disabled";
  disabledReason: string | null;
  previousSecretValidUntil: string | null;
}

export interface ChatConnection {
  id: string;
  provider: "slack" | "teams";
  label: string;
  targetHint: string;
  alerts: string[];
  programId: string | null;
  status: "active" | "paused" | "disabled";
  disabledReason: string | null;
}

export interface Delivery {
  id: string;
  targetId: string;
  targetKind: "webhook" | "slack" | "teams";
  eventType: string;
  status: "succeeded" | "failed" | "pending" | "delivering";
  attempts: number;
  maxAttempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  durationMs: number | null;
  nextAttemptAt: string;
  createdAt: string;
  isReplay: boolean;
}

export function slackAppConfigured(): boolean {
  return Boolean(
    process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET,
  );
}

export async function listWebhookEndpoints(
  _organizationId: string,
): Promise<WebhookEndpoint[]> {
  return [];
}

export async function listChatConnections(
  _organizationId: string,
): Promise<ChatConnection[]> {
  return [];
}

export async function listDeliveries(
  _organizationId: string,
  _kinds: ("webhook" | "slack" | "teams")[],
): Promise<Delivery[]> {
  return [];
}

export async function createWebhookEndpoint(
  _organizationId: string,
  _input: {
    url: string;
    description: string;
    eventTypes: string[];
    programId: string | null;
  },
): Promise<string> {
  return "";
}

export async function updateWebhookEndpoint(
  _endpointId: string,
  _input: {
    url: string;
    description: string;
    eventTypes: string[];
    programId: string | null;
    status: "active" | "paused";
  },
): Promise<void> {}

export async function rotateWebhookSecret(_endpointId: string): Promise<string> {
  return "";
}

export async function deleteIntegrationTarget(
  _targetKind: "webhook" | "slack" | "teams",
  _targetId: string,
): Promise<void> {}

export async function queueIntegrationTest(
  _targetKind: "webhook" | "slack" | "teams",
  _targetId: string,
): Promise<void> {}

export async function replayDelivery(_deliveryId: string): Promise<void> {}

export async function createChatConnection(
  _organizationId: string,
  _input: {
    provider: "slack" | "teams";
    label: string;
    url: string;
    alerts: string[];
    programId: string | null;
  },
): Promise<void> {}

export async function updateChatConnection(
  _connectionId: string,
  _input: {
    alerts: string[];
    programId: string | null;
    status: "active" | "paused";
  },
): Promise<void> {}

export async function startSlackInstall(
  organizationId: string,
): Promise<string> {
  return `/organizations/${organizationId}/integrations/chat`;
}

export async function completeSlackInstall(
  searchParams: URLSearchParams,
): Promise<{ organizationId: string | null; error?: string }> {
  const state = searchParams.get("state");
  const code = searchParams.get("code");
  if (!state || !code) {
    return {
      organizationId: null,
      error: "Missing Slack authorization parameters.",
    };
  }
  return { organizationId: null };
}
