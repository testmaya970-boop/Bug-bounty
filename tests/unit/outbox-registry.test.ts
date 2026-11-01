import { beforeEach, describe, expect, it, vi } from "vitest";

describe("outbox registry: keyed by eventType:schemaVersion, never eventType alone", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns an empty list for an unregistered type/version pair", async () => {
    const { getHandlers } = await import("../../workers/outbox/registry");
    expect(getHandlers("nothing.registered", 1)).toEqual([]);
  });

  it("registers and retrieves a handler by the exact type+version pair", async () => {
    const { registerHandler, getHandlers } = await import("../../workers/outbox/registry");
    const handler = vi.fn();
    registerHandler("widget.created", 1, handler);
    expect(getHandlers("widget.created", 1)).toEqual([handler]);
  });

  it("a v2 registration does not shadow or get shadowed by v1 -- distinct handlers for distinct versions", async () => {
    const { registerHandler, getHandlers } = await import("../../workers/outbox/registry");
    const v1 = vi.fn();
    const v2 = vi.fn();
    registerHandler("widget.updated", 1, v1);
    registerHandler("widget.updated", 2, v2);
    expect(getHandlers("widget.updated", 1)).toEqual([v1]);
    expect(getHandlers("widget.updated", 2)).toEqual([v2]);
    expect(getHandlers("widget.updated", 3)).toEqual([]);
  });

  it("a second registration for the SAME type+version pair adds a second independent consumer rather than replacing the first", async () => {
    const { registerHandler, getHandlers } = await import("../../workers/outbox/registry");
    const first = vi.fn();
    const second = vi.fn();
    registerHandler("widget.archived", 1, first);
    registerHandler("widget.archived", 1, second);
    expect(getHandlers("widget.archived", 1)).toEqual([first, second]);
  });

  it("RetryableHandlerError and PermanentHandlerError are distinct, real Error subclasses", async () => {
    const { RetryableHandlerError, PermanentHandlerError } = await import("../../workers/outbox/registry");
    const retryable = new RetryableHandlerError("transient");
    const permanent = new PermanentHandlerError("will never succeed");
    expect(retryable).toBeInstanceOf(Error);
    expect(permanent).toBeInstanceOf(Error);
    expect(retryable).not.toBeInstanceOf(PermanentHandlerError);
    expect(permanent).not.toBeInstanceOf(RetryableHandlerError);
  });
});
