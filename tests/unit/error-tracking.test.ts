import { describe, expect, it } from "vitest";
import { errorFingerprint } from "../../lib/error-tracking";

describe("error fingerprint", () => {
  it("groups the same bug across different ids, numbers and quoted values", () => {
    const a = errorFingerprint("server", 'invalid input syntax for type uuid: "perf-template-1"', "Error\n    at upsert (services/report-templates.ts:58:7)");
    const b = errorFingerprint("server", 'invalid input syntax for type uuid: "IDOR v2"', "Error\n    at upsert (services/report-templates.ts:61:9)");
    expect(a).toBe(b);
    expect(errorFingerprint("client", "Report 3f2b1c4d-1111-2222-3333-444455556666 failed after 12 tries")).toBe(
      errorFingerprint("client", "Report 9a8b7c6d-aaaa-bbbb-cccc-ddddeeeeffff failed after 3 tries"),
    );
  });

  it("separates different messages, stack locations and sources", () => {
    const base = errorFingerprint("server", "boom", "at a (x.ts:1:1)");
    expect(errorFingerprint("server", "bang", "at a (x.ts:1:1)")).not.toBe(base);
    expect(errorFingerprint("server", "boom", "at b (y.ts:1:1)")).not.toBe(base);
    expect(errorFingerprint("client", "boom", "at a (x.ts:1:1)")).not.toBe(base);
  });
});
