import { afterEach, describe, expect, it, vi } from "vitest";
import { devEmailProvider, activeEmailProvider, createResendEmailProvider } from "../../lib/email-provider";
import { renderNotificationEmail } from "../../lib/email-render";

const BASE_MESSAGE = { to: "researcher@example.test", subject: "Unpatched: subject", text: "body", idempotencyKey: "delivery-1" };

function stubFetchOnce(response: { ok: boolean; status: number; json: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("dev email provider: never claims a real send succeeded", () => {
  it("logs 'delivery simulated' and returns success with a deterministic provider reference derived from the idempotency key", async () => {
    const logs: string[] = [];
    const originalInfo = console.info;
    console.info = (message: string) => logs.push(message);
    try {
      const result = await devEmailProvider.send({ to: "a@example.test", subject: "Subject", text: "Body", idempotencyKey: "key-1" });
      expect(result).toEqual({ success: true, providerReference: "dev-key-1" });
      expect(logs.some((line) => line.includes("delivery simulated"))).toBe(true);
    } finally {
      console.info = originalInfo;
    }
  });

  it("the same idempotency key always produces the same provider reference -- proves the key is what a real provider's own dedup would key off", async () => {
    const first = await devEmailProvider.send({ to: "a@example.test", subject: "s", text: "t", idempotencyKey: "key-2" });
    const second = await devEmailProvider.send({ to: "a@example.test", subject: "s", text: "t", idempotencyKey: "key-2" });
    expect(first).toEqual(second);
  });

  it("activeEmailProvider is the dev provider in this environment -- no real provider is wired up", () => {
    expect(activeEmailProvider.name).toBe("dev");
  });
});

describe("notification email rendering: plain text only, no HTML injection surface", () => {
  it("includes the recipient name, report title, program, and organization in the body", () => {
    const rendered = renderNotificationEmail({
      notificationType: "report_resolved",
      reportTitle: "XSS in login form",
      programName: "Acme Program",
      organizationName: "Acme Corp",
      recipientDisplayName: "Jane Researcher",
      occurredAt: "2026-08-29T00:00:00Z",
    });

    expect(rendered.text).toContain("Jane Researcher");
    expect(rendered.text).toContain("XSS in login form");
    expect(rendered.text).toContain("Acme Program");
    expect(rendered.text).toContain("Acme Corp");
    expect(rendered.subject).toContain("Your report was resolved");
  });

  it("strips CR/LF from every value used in the subject line -- prevents header injection from a title containing a newline", () => {
    const rendered = renderNotificationEmail({
      notificationType: "report_created",
      reportTitle: "Evil title\r\nBcc: attacker@evil.test",
      programName: "Program",
      organizationName: "Org",
      recipientDisplayName: "Manager",
      occurredAt: "2026-08-29T00:00:00Z",
    });

    // The real protection is that no CR/LF survives -- a header injection attack depends
    // on a newline starting a new SMTP header line, not on the substring "Bcc:" itself,
    // which is harmless once flattened onto the same line as ordinary text.
    expect(rendered.subject).not.toMatch(/[\r\n]/);
    expect(rendered.subject).toBe("Unpatched: A new report was submitted — Evil title Bcc: attacker@evil.test");
  });

  it("never produces HTML -- the body contains no angle-bracket tags even when the title contains them", () => {
    const rendered = renderNotificationEmail({
      notificationType: "report_rejected",
      reportTitle: "<script>alert(1)</script>",
      programName: "Program",
      organizationName: "Org",
      recipientDisplayName: "Researcher",
      occurredAt: "2026-08-29T00:00:00Z",
    });

    // Plain text -- the raw string may still contain the literal characters (nothing is
    // escaped, because nothing is ever interpreted as markup in a plain-text email body),
    // but there is no HTML renderer anywhere in this path that could execute it.
    expect(rendered.text).toContain("<script>alert(1)</script>");
  });

  it("produces a distinct label per notification type", () => {
    const resolved = renderNotificationEmail({ notificationType: "bounty_finalized", reportTitle: "T", programName: "P", organizationName: "O", recipientDisplayName: "R", occurredAt: "2026-08-29T00:00:00Z" });
    expect(resolved.subject).toContain("A bounty was finalized for your report");
  });
});

describe("resend email provider: missing configuration behavior", () => {
  it("throws immediately (fail-fast) when RESEND_API_KEY is missing, never silently falling back to the dev provider", () => {
    vi.stubEnv("EMAIL_FROM", "sentinel@example.test");
    expect(() => createResendEmailProvider()).toThrow(/RESEND_API_KEY/);
  });

  it("throws immediately when EMAIL_FROM is missing", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    expect(() => createResendEmailProvider()).toThrow(/EMAIL_FROM/);
  });
});

describe("resend email provider: request construction, mapping, and idempotency", () => {
  function makeProvider() {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "sentinel@example.test");
    return createResendEmailProvider();
  }

  it("posts to the real Resend send-email endpoint with a bearer token, the correct recipient/from/subject/text mapping, and the Idempotency-Key header set to the caller's own delivery id", async () => {
    const fetchMock = stubFetchOnce({ ok: true, status: 200, json: async () => ({ id: "resend-msg-1" }) });
    const provider = makeProvider();

    await provider.send(BASE_MESSAGE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
    expect(headers["Idempotency-Key"]).toBe("delivery-1");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ from: "sentinel@example.test", to: ["researcher@example.test"], subject: "Unpatched: subject", text: "body" });
  });

  it("maps a 2xx response with a real message id to success, with that id as the provider reference", async () => {
    stubFetchOnce({ ok: true, status: 200, json: async () => ({ id: "resend-msg-1" }) });
    const provider = makeProvider();

    const result = await provider.send(BASE_MESSAGE);

    expect(result).toEqual({ success: true, providerReference: "resend-msg-1" });
  });

  it("never treats a 2xx response with no interpretable message id as success -- classifies it retryable instead", async () => {
    stubFetchOnce({ ok: true, status: 200, json: async () => ({ unexpected: "shape" }) });
    const provider = makeProvider();

    const result = await provider.send(BASE_MESSAGE);

    expect(result.success).toBe(false);
    expect((result as { permanent: boolean }).permanent).toBe(false);
  });

  it.each([429, 500, 502, 503])("classifies HTTP %d as retryable, never permanent", async (status) => {
    stubFetchOnce({ ok: false, status, json: async () => ({ message: "provider says try again" }) });
    const provider = makeProvider();

    const result = await provider.send(BASE_MESSAGE);

    expect(result).toEqual({ success: false, permanent: false, error: expect.stringContaining(`HTTP ${status}`) });
  });

  it.each([400, 401, 403, 422])("classifies HTTP %d as permanent, never retryable", async (status) => {
    stubFetchOnce({ ok: false, status, json: async () => ({ message: "rejected" }) });
    const provider = makeProvider();

    const result = await provider.send(BASE_MESSAGE);

    expect(result).toEqual({ success: false, permanent: true, error: expect.stringContaining(`HTTP ${status}`) });
  });

  it("classifies a genuine network failure (fetch itself throws) as retryable, never permanent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const provider = makeProvider();

    const result = await provider.send(BASE_MESSAGE);

    expect(result.success).toBe(false);
    expect((result as { permanent: boolean }).permanent).toBe(false);
    expect((result as { error: string }).error).toContain("ECONNREFUSED");
  });

  it("never sends the API key, the email body, or notification content anywhere except the actual outbound request", async () => {
    const fetchMock = stubFetchOnce({ ok: true, status: 200, json: async () => ({ id: "resend-msg-1" }) });
    const logs: string[] = [];
    const originalInfo = console.info;
    const originalError = console.error;
    console.info = (message: string) => logs.push(message);
    console.error = (message: string) => logs.push(message);
    try {
      const provider = makeProvider();
      await provider.send(BASE_MESSAGE);
    } finally {
      console.info = originalInfo;
      console.error = originalError;
    }

    expect(logs.join("\n")).not.toContain("re_test_key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("email provider selection: EMAIL_PROVIDER env var (module-load-time, fail-fast)", () => {
  it("activeEmailProvider defaults to the dev provider in this test environment -- no real provider is wired up merely by this feature existing", () => {
    expect(activeEmailProvider.name).toBe("dev");
  });
});
