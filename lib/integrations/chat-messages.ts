// Slack and Microsoft Teams messages for an integration delivery. Pure, so it is unit tested.
// Only what the delivery payload carries: title, status, severity, program and a link. Never the
// report description, steps or attachments.

export type DeliveryPayload = {
  id: string;
  type: string;
  occurred_at?: string;
  alerts?: string[];
  data: {
    message?: string;
    sla?: string | null;
    report?: { id: string; title: string; status: string; severity: string | null; priority: string | null; program_name: string; path: string };
  };
};

const EVENT_TEXT: Record<string, string> = {
  "report.created": "New report",
  "report.triage_started": "Triage started",
  "report.needs_information": "More information requested",
  "report.accepted": "Report accepted",
  "report.resolved": "Report resolved",
  "report.duplicate": "Closed as duplicate",
  "report.informative": "Closed as informative",
  "report.not_applicable": "Closed as not applicable",
  "report.rejected": "Report rejected",
  "report.sla_breached": "SLA breached",
  "integration.test": "Test message",
};

const SLA_TEXT: Record<string, string> = { first_response: "first response", triage: "triage", resolution: "resolution" };

export function headline(p: DeliveryPayload): string {
  const critical = p.alerts?.includes("critical") ? "Critical: " : "";
  const base = EVENT_TEXT[p.type] ?? p.type;
  return p.type === "report.sla_breached" && p.data.sla ? `${critical}${base} (${SLA_TEXT[p.data.sla] ?? p.data.sla} target missed)` : `${critical}${base}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

/** Slack mrkdwn needs &, < and > escaped, or a report title could inject a link. */
export function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function slackMessage(p: DeliveryPayload, appOrigin: string): Record<string, unknown> {
  const r = p.data.report;
  if (!r) return { text: slackEscape(`${headline(p)}: ${p.data.message ?? "Unpatched is connected to this channel."}`) };
  const url = `${appOrigin.replace(/\/$/, "")}${r.path}`;
  const facts = [`*Program:* ${slackEscape(r.program_name)}`, `*Status:* ${cap(r.status)}`, `*Severity:* ${r.severity ? cap(r.severity) : "Not set"}`];
  return {
    text: slackEscape(`${headline(p)}: ${r.title}`),
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${slackEscape(headline(p))}*\n<${url}|${slackEscape(r.title)}>` } },
      { type: "context", elements: facts.map((t) => ({ type: "mrkdwn", text: t })) },
    ],
  };
}

export function teamsMessage(p: DeliveryPayload, appOrigin: string): Record<string, unknown> {
  const r = p.data.report;
  const body: unknown[] = [{ type: "TextBlock", text: headline(p), weight: "Bolder", size: "Medium", wrap: true }];
  const actions: unknown[] = [];
  if (r) {
    body.push(
      { type: "TextBlock", text: r.title, wrap: true },
      { type: "FactSet", facts: [{ title: "Program", value: r.program_name }, { title: "Status", value: cap(r.status) }, { title: "Severity", value: r.severity ? cap(r.severity) : "Not set" }] },
    );
    actions.push({ type: "Action.OpenUrl", title: "Open in Unpatched", url: `${appOrigin.replace(/\/$/, "")}${r.path}` });
  } else {
    body.push({ type: "TextBlock", text: p.data.message ?? "Unpatched is connected to this channel.", wrap: true });
  }
  return {
    type: "message",
    attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: { $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4", body, actions } }],
  };
}

/** Which hosts a chat URL may point at. Slack incoming webhooks live on hooks.slack.com; Teams
 * Workflows URLs on Logic Apps or Power Platform hosts. Anything else is refused (SSRF). */
export function chatUrlHostAllowed(provider: "slack" | "teams", url: URL): boolean {
  if (provider === "slack") return url.hostname === "hooks.slack.com" && url.pathname.startsWith("/services/");
  return /(^|\.)logic\.azure\.com$/.test(url.hostname) || /(^|\.)api\.powerplatform\.com$/.test(url.hostname);
}

/** What the settings page shows instead of the secret URL. */
export function chatTargetHint(provider: "slack" | "teams", url: URL): string {
  return provider === "slack" ? "hooks.slack.com/services/…" : `${url.hostname}/…`;
}
