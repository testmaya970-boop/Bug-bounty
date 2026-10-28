import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkOutboundUrl, isPublicAddress, safeFetch, UnsafeUrlError } from "../../lib/integrations/safe-fetch";
import { generateWebhookSecret, signWebhook, verifyWebhook, webhookHeaders } from "../../lib/integrations/webhook-signature";
import { chatUrlHostAllowed, headline, slackEscape, slackMessage, teamsMessage } from "../../lib/integrations/chat-messages";
import { sendDelivery } from "../../workers/integrations/delivery";

const prodEnv = { NODE_ENV: "production", APP_ORIGIN: "https://app.unpatched.io" } as NodeJS.ProcessEnv;

describe("SSRF guard", () => {
  it("only public addresses pass", () => {
    for (const a of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1"]) {
      expect(isPublicAddress(a), a).toBe(false);
    }
    for (const a of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicAddress(a), a).toBe(true);
  });

  it("refuses http, credentials, odd ports, private literals and internal names", () => {
    expect(() => checkOutboundUrl("http://example.com/hook", prodEnv)).toThrow(UnsafeUrlError);
    expect(() => checkOutboundUrl("https://user:pw@example.com/hook", prodEnv)).toThrow(/username/);
    expect(() => checkOutboundUrl("https://example.com:6379/", prodEnv)).toThrow(/port/);
    expect(() => checkOutboundUrl("https://169.254.169.254/latest/meta-data", prodEnv)).toThrow(/private/);
    expect(() => checkOutboundUrl("https://[::1]/", prodEnv)).toThrow(/private/);
    expect(() => checkOutboundUrl("https://db.internal/", prodEnv)).toThrow(/internal/);
    expect(checkOutboundUrl("https://hooks.example.com:8443/x", prodEnv).hostname).toBe("hooks.example.com");
  });

  it("refuses a name that resolves to a private address at connect time", async () => {
    await expect(safeFetch("https://localhost/", {}, prodEnv)).rejects.toThrow();
    await expect(safeFetch("https://127.0.0.1.nip.io/", {}, prodEnv)).rejects.toThrow(); // resolves to loopback, or not at all offline
  });

  it("loopback delivery only in test mode, never in production", () => {
    expect(() => checkOutboundUrl("http://127.0.0.1:9/x", { ...prodEnv, ALLOW_LOOPBACK_DELIVERY: "1" })).toThrow();
    expect(checkOutboundUrl("http://127.0.0.1:9/x", { NODE_ENV: "test", ALLOW_LOOPBACK_DELIVERY: "1" } as NodeJS.ProcessEnv).port).toBe("9");
  });
});

describe("webhook signatures (Standard Webhooks)", () => {
  it("a receiver verifies what we sign, and rejects tampering, old timestamps and other secrets", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ id: "e1", type: "report.created" });
    const headers = webhookHeaders([secret], "msg_1", 1_800_000_000, body);
    expect(verifyWebhook(secret, headers, body, 1_800_000_010)).toBe(true);
    expect(verifyWebhook(secret, headers, body + " ", 1_800_000_010)).toBe(false);
    expect(verifyWebhook(secret, headers, body, 1_800_000_400)).toBe(false); // replayed after 5 minutes
    expect(verifyWebhook(generateWebhookSecret(), headers, body, 1_800_000_010)).toBe(false);
  });

  it("during a rotation both secrets sign, so either verifies", () => {
    const oldS = generateWebhookSecret();
    const newS = generateWebhookSecret();
    const h = webhookHeaders([newS, oldS], "msg_2", 1_800_000_000, "{}");
    expect(h["webhook-signature"].split(" ")).toHaveLength(2);
    expect(verifyWebhook(oldS, h, "{}", 1_800_000_000)).toBe(true);
    expect(verifyWebhook(newS, h, "{}", 1_800_000_000)).toBe(true);
    expect(signWebhook(newS, "a", 1, "b")).toMatch(/^v1,[A-Za-z0-9+/=]+$/);
  });
});

describe("chat messages", () => {
  const payload = { id: "e", type: "report.created", alerts: ["new_report", "critical"], data: { report: { id: "r", title: "<!channel> & <https://evil|x>", status: "new", severity: "critical", priority: null, program_name: "Acme", path: "/organizations/o/programs/p/reports/r" } } };

  it("never lets a report title inject Slack markup, and links back to Unpatched", () => {
    const m = JSON.stringify(slackMessage(payload, "https://app.unpatched.io"));
    expect(m).not.toContain("<!channel>");
    expect(m).toContain(slackEscape("<!channel>"));
    expect(m).toContain("https://app.unpatched.io/organizations/o/programs/p/reports/r");
    expect(headline(payload)).toBe("Critical: New report");
  });

  it("Teams gets an Adaptive Card; only Slack and Workflows hosts are accepted", () => {
    const t = teamsMessage(payload, "https://app.unpatched.io") as { attachments: { contentType: string }[] };
    expect(t.attachments[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(chatUrlHostAllowed("slack", new URL("https://hooks.slack.com/services/T/B/x"))).toBe(true);
    expect(chatUrlHostAllowed("slack", new URL("https://evil.com/services/x"))).toBe(false);
    expect(chatUrlHostAllowed("teams", new URL("https://prod-12.westus.logic.azure.com/workflows/x"))).toBe(true);
    expect(chatUrlHostAllowed("teams", new URL("https://x.environment.api.powerplatform.com/powerautomate/x"))).toBe(true);
    expect(chatUrlHostAllowed("teams", new URL("https://logic.azure.com.evil.com/x"))).toBe(false);
  });
});

describe("delivery against a real local receiver", () => {
  let server: Server;
  let port = 0;
  const received: { headers: Record<string, string>; body: string }[] = [];
  let nextStatus = 200;
  const saved = { ...process.env };

  beforeAll(async () => {
    process.env.ALLOW_LOOPBACK_DELIVERY = "1";
    process.env.APP_ORIGIN = "http://127.0.0.1:3100";
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers as Record<string, string>, body });
        res.statusCode = nextStatus;
        res.end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => {
    server.close();
    process.env = saved;
  });

  it("a webhook arrives signed and verifiable; a 500 is retryable, a 410 is final", async () => {
    const secret = generateWebhookSecret();
    const d = { id: "d1", target_kind: "webhook" as const, message_id: "msg_x", attempts: 1, payload: { id: "x", type: "report.created", data: {} } };
    const ok = await sendDelivery(d, { target_kind: "webhook", url: `http://127.0.0.1:${port}/hook`, secrets: [secret], target_status: "active" });
    expect(ok).toMatchObject({ success: true, status: 200 });
    const got = received.at(-1)!;
    expect(verifyWebhook(secret, got.headers, got.body)).toBe(true);

    nextStatus = 500;
    expect(await sendDelivery(d, { target_kind: "webhook", url: `http://127.0.0.1:${port}/hook`, secrets: [secret], target_status: "active" })).toMatchObject({ success: false, permanent: false });
    nextStatus = 410;
    expect(await sendDelivery(d, { target_kind: "webhook", url: `http://127.0.0.1:${port}/hook`, secrets: [secret], target_status: "active" })).toMatchObject({ success: false, permanent: true });
    nextStatus = 200;
  });

  it("a removed or disabled target, or a non-Teams URL, fails for good without sending", async () => {
    const before = received.length;
    const d = { id: "d2", target_kind: "teams" as const, message_id: "m", attempts: 1, payload: { id: "x", type: "integration.test", data: { message: "hi" } } };
    expect(await sendDelivery(d, { target_kind: "teams", url: null, secrets: null, target_status: null })).toMatchObject({ permanent: true });
    expect(await sendDelivery(d, { target_kind: "teams", url: "https://evil.example.com/x", secrets: [], target_status: "active" })).toMatchObject({ permanent: true });
    expect(received.length).toBe(before);
  });
});
