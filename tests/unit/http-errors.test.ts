import { describe, expect, it } from "vitest";
import { httpStatusForErrorCode } from "../../lib/http-errors";

describe("httpStatusForErrorCode: a stable, explicit CODE -> HTTP status map", () => {
  it.each([
    ["AUTH_REQUIRED", 401],
    ["INVALID_CREDENTIALS", 401],
    ["FORBIDDEN", 403],
    ["LAST_OWNER", 403],
    ["PROGRAM_NOT_FOUND", 404],
    ["REPORT_NOT_FOUND", 404],
    ["NOTIFICATION_NOT_FOUND", 404],
    ["BOUNTY_ALREADY_FINALIZED", 409],
    ["PROVENANCE_MISMATCH", 409],
    ["INVALID_TITLE", 422],
    ["TARGET_NOT_ELIGIBLE", 422],
    ["CATEGORY_NOT_CONFIGURABLE", 422],
    ["RATE_LIMITED", 429],
  ] as const)("maps %s to %i", (code, expected) => {
    expect(httpStatusForErrorCode(code)).toBe(expected);
  });

  it("defaults an unrecognized code to 500 -- never worse than the pre-existing 'UNKNOWN' fallback", () => {
    expect(httpStatusForErrorCode("SOMETHING_NEVER_SEEN_BEFORE")).toBe(500);
    expect(httpStatusForErrorCode("UNKNOWN")).toBe(500);
  });
});
