import { describe, expect, it, vi } from "vitest";
import { simpleParser } from "mailparser";
import { aliasLocalPart, aliasRecipients, buildForward, getAliasMailConfig, processAliasMessage, type AliasMailDeps } from "../../lib/alias-mail";

const config = {
  domain: "alias.netras.ai",
  mailboxUser: "forwarder@alias.netras.ai",
  mailboxPassword: "x",
  imapHost: "imap.hostinger.com",
  smtpHost: "smtp.hostinger.com",
  brandName: "Netras",
};

const raw = (headers: string, body = "Your code is 4242") =>
  simpleParser(`${headers}\r\nMessage-ID: <m1@shop.example>\r\nSubject: Verify\r\nContent-Type: text/plain\r\n\r\n${body}\r\n`);

describe("config", () => {
  it("is off until the domain and the catch-all mailbox login are set; defaults to Hostinger hosts", () => {
    expect(getAliasMailConfig({ ALIAS_EMAIL_DOMAIN: "alias.netras.ai" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(
      getAliasMailConfig({ ALIAS_EMAIL_DOMAIN: "Alias.Netras.ai", ALIAS_MAILBOX_USER: "forwarder@alias.netras.ai", ALIAS_MAILBOX_PASSWORD: "p" } as unknown as NodeJS.ProcessEnv),
    ).toMatchObject({ domain: "alias.netras.ai", imapHost: "imap.hostinger.com", smtpHost: "smtp.hostinger.com", brandName: "Netras" });
  });
});

describe("aliasLocalPart", () => {
  it("returns the alias for our domain only, lower-cased, ignoring +tags", () => {
    expect(aliasLocalPart("Alice_01@alias.netras.ai", "alias.netras.ai")).toBe("alice_01");
    expect(aliasLocalPart("<alice+shopify@ALIAS.netras.ai>", "alias.netras.ai")).toBe("alice");
    expect(aliasLocalPart("alice@netras.ai", "alias.netras.ai")).toBeNull();
    expect(aliasLocalPart("alice@alias.netras.ai.evil.com", "alias.netras.ai")).toBeNull();
  });
});

describe("aliasRecipients", () => {
  it("finds aliases in Delivered-To, To and Cc, once each, never the catch-all mailbox itself", async () => {
    const parsed = await raw(
      "Delivered-To: forwarder@alias.netras.ai\r\nX-Original-To: alice+shop@alias.netras.ai\r\nFrom: Shop <noreply@shop.example>\r\nTo: Alice <alice@alias.netras.ai>, someone@else.example\r\nCc: bob_2@alias.netras.ai",
    );
    expect(aliasRecipients(parsed.headerLines, config).sort()).toEqual(["alice", "bob_2"]);
  });
});

describe("buildForward", () => {
  it("sends from the mailbox with the original sender in the name and Reply-To", async () => {
    const parsed = await raw("From: Shop <noreply@shop.example>\r\nTo: alice@alias.netras.ai");
    const mail = buildForward(config, parsed, "alice@real.example", "alice");
    expect(mail.from).toBe('"Shop noreply@shop.example via Netras" <forwarder@alias.netras.ai>');
    expect(mail.replyTo).toBe('"Shop" <noreply@shop.example>');
    expect(mail.to).toBe("alice@real.example");
    expect(mail.subject).toBe("Verify");
    expect(mail.text).toContain("4242");
    expect(mail.headers["X-Forwarded-For-Alias"]).toBe("alice@alias.netras.ai");
  });
});

describe("processAliasMessage", () => {
  const deps = (overrides: Partial<AliasMailDeps> = {}): AliasMailDeps & { resolve: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; complete: ReturnType<typeof vi.fn> } =>
    ({
      resolve: vi.fn(async () => ({ forwardId: "fwd-1", outcome: "received", recipientEmail: "alice@real.example" })),
      complete: vi.fn(async () => undefined),
      send: vi.fn(async () => ({ ok: true as const, messageId: "<sent@hostinger>" })),
      ...overrides,
    }) as never;

  it("forwards each alias recipient once, keyed by Message-ID + alias, then files the message", async () => {
    const parsed = await raw("From: noreply@shop.example\r\nTo: alice@alias.netras.ai, bob_2@alias.netras.ai");
    const d = deps();
    expect(await processAliasMessage(config, parsed, "hash", d)).toBe("done");
    expect(d.resolve.mock.calls.map((c) => c[0])).toEqual(["<m1@shop.example>|alice", "<m1@shop.example>|bob_2"]);
    expect(d.send).toHaveBeenCalledTimes(2);
    expect(d.complete).toHaveBeenCalledWith("fwd-1", true, "<sent@hostinger>", null);
  });

  it("never forwards mail from our own alias domain (loop guard)", async () => {
    const parsed = await raw("From: alice@alias.netras.ai\r\nTo: bob_2@alias.netras.ai");
    const d = deps();
    expect(await processAliasMessage(config, parsed, "hash", d)).toBe("done");
    expect(d.resolve).not.toHaveBeenCalled();
  });

  it("files a refused or replayed message without sending", async () => {
    const parsed = await raw("From: noreply@shop.example\r\nTo: ghost@alias.netras.ai");
    const d = deps({ resolve: vi.fn(async () => ({ forwardId: "fwd-2", outcome: "rejected_unknown_alias", recipientEmail: null })) });
    expect(await processAliasMessage(config, parsed, "hash", d)).toBe("done");
    expect(d.send).not.toHaveBeenCalled();
  });

  it("leaves a temporary SMTP failure for the next poll, but files a permanent one", async () => {
    const parsed = await raw("From: noreply@shop.example\r\nTo: alice@alias.netras.ai");
    const temporary = deps({ send: vi.fn(async () => ({ ok: false as const, permanent: false, error: "retryable (SMTP 451)" })) });
    expect(await processAliasMessage(config, parsed, "hash", temporary)).toBe("retry");
    expect(temporary.complete).toHaveBeenCalledWith("fwd-1", false, null, "retryable (SMTP 451)");
    const permanent = deps({ send: vi.fn(async () => ({ ok: false as const, permanent: true, error: "permanent (SMTP 550)" })) });
    expect(await processAliasMessage(config, parsed, "hash", permanent)).toBe("done");
  });

  it("falls back to a content hash when a message has no Message-ID", async () => {
    const parsed = await simpleParser("From: noreply@shop.example\r\nTo: alice@alias.netras.ai\r\nSubject: x\r\n\r\nbody\r\n");
    const d = deps();
    await processAliasMessage(config, parsed, "abc123", d);
    expect(d.resolve.mock.calls[0][0]).toBe("sha256:abc123|alice");
  });
});
