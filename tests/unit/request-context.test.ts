import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../lib/logger";
import { withRequestLogging } from "../../lib/request-context";

describe("withRequestLogging: a request id, timing, and safe error classification around one operation", () => {
  beforeEach(() => {
    vi.spyOn(logger, "log").mockImplementation(() => {});
  });

  it("logs a 'started' then 'completed' pair sharing the same requestId, and returns the operation's result", async () => {
    const result = await withRequestLogging("test.op", { actorId: "actor-1", organizationId: "org-1" }, async (requestId) => {
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
      return "ok";
    });

    expect(result).toBe("ok");
    const calls = vi.mocked(logger.log).mock.calls.map((call) => call[0]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ level: "info", operation: "test.op", actorId: "actor-1", organizationId: "org-1", message: "started" });
    expect(calls[1]).toMatchObject({ level: "info", operation: "test.op", message: "completed" });
    expect(calls[0].requestId).toBe(calls[1].requestId);
    expect(typeof calls[1].durationMs).toBe("number");
  });

  it("logs a 'failed' entry with the thrown error's own code, then re-throws the original error unchanged", async () => {
    class FakeServiceError extends Error {
      code = "FORBIDDEN";
    }
    const thrown = new FakeServiceError("nope");

    await expect(
      withRequestLogging("test.op", {}, async () => {
        throw thrown;
      }),
    ).rejects.toBe(thrown);

    const calls = vi.mocked(logger.log).mock.calls.map((call) => call[0]);
    expect(calls[1]).toMatchObject({ level: "error", operation: "test.op", errorCode: "FORBIDDEN", message: "failed" });
  });

  it("falls back to errorCode 'UNKNOWN' for a plain thrown value with no .code", async () => {
    await expect(
      withRequestLogging("test.op", {}, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const calls = vi.mocked(logger.log).mock.calls.map((call) => call[0]);
    expect(calls[1]).toMatchObject({ errorCode: "UNKNOWN" });
  });

  it("defaults actorId/organizationId to null, never undefined, when not supplied", async () => {
    await withRequestLogging("test.op", {}, async () => "ok");
    const calls = vi.mocked(logger.log).mock.calls.map((call) => call[0]);
    expect(calls[0].actorId).toBeNull();
    expect(calls[0].organizationId).toBeNull();
  });
});
