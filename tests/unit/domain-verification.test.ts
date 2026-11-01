import { describe, expect, it } from "vitest";
import { txtRecordName, txtRecordValue, txtRecordsContainToken } from "../../lib/domain-verification";

describe("domain verification TXT record", () => {
  it("names and values the record", () => {
    expect(txtRecordName("acme.com")).toBe("_unpatched-challenge.acme.com");
    expect(txtRecordValue("ab12")).toBe("unpatched-verification=ab12");
  });

  it("matches only the exact value, joining split chunks", () => {
    expect(txtRecordsContainToken([["v=spf1 -all"], ["unpatched-verification=", "ab12"]], "ab12")).toBe(true);
    expect(txtRecordsContainToken([["unpatched-verification=ab12x"]], "ab12")).toBe(false);
    expect(txtRecordsContainToken([["xunpatched-verification=ab12"]], "ab12")).toBe(false);
    expect(txtRecordsContainToken([], "ab12")).toBe(false);
  });
});
