import { describe, expect, it } from "vitest";
import { renderNotificationEmail } from "@/lib/email-render";

describe("renderNotificationEmail: program_recommended (202610210005)", () => {
  const base = { notificationType: "program_recommended" as const, reportTitle: "", programName: "Northwind Payments Bug Bounty", organizationName: "Northwind Payments", recipientDisplayName: "Ada", occurredAt: "2026-10-21T10:00:00Z" };

  it("names the program and says why it was sent and how to stop it", () => {
    const { subject, text } = renderNotificationEmail(base);
    expect(subject).toBe("Unpatched: new program for you: Northwind Payments Bug Bounty");
    expect(text).toContain("Program: Northwind Payments Bug Bounty");
    expect(text).toContain("haven't visited in a while");
    expect(text).toContain("Settings > Notifications");
  });

  it("keeps organization-supplied names out of the headers' line breaks", () => {
    const { subject } = renderNotificationEmail({ ...base, programName: "Evil\r\nBcc: victim@example.com" });
    expect(subject).not.toMatch(/[\r\n]/);
  });
});
