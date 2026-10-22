import { describe, expect, it } from "vitest";
import { formatDocumentMoney } from "../../lib/money";

describe("document money", () => {
  it("groups rupees in lakhs and other currencies in thousands, from exact minor units", () => {
    expect(formatDocumentMoney(28000000, "INR")).toBe("INR 2,80,000.00");
    expect(formatDocumentMoney(123456789, "INR")).toBe("INR 12,34,567.89");
    expect(formatDocumentMoney(500000, "USD")).toBe("USD 5,000.00");
    expect(formatDocumentMoney(-590000, "INR")).toBe("-INR 5,900.00");
    expect(formatDocumentMoney(5, "USD")).toBe("USD 0.05");
  });
});
