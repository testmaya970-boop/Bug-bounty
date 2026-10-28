import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { businessRuleScript, checkInstanceUrl, closeServiceNowRecord, createServiceNowRecord, verifyServiceNowToken } from "../../lib/integrations/servicenow";

describe("ServiceNow", () => {
  let server: Server;
  let base = "";
  const seen: { method: string; url: string; auth: string | undefined; body: string }[] = [];
  const saved = { ...process.env };

  beforeAll(async () => {
    process.env.ALLOW_LOOPBACK_DELIVERY = "1";
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ result: { sys_id: "a".repeat(32), number: "INC0010001" } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => {
    server.close();
    process.env = saved;
  });

  it("only ServiceNow-hosted instances are accepted", () => {
    expect(checkInstanceUrl("https://acme.service-now.com/")).toBe("https://acme.service-now.com");
    expect(() => checkInstanceUrl("https://evil.example.com")).toThrow(/instance address/);
    expect(() => checkInstanceUrl("https://acme.service-now.com.evil.com")).toThrow();
  });

  it("creates a record with Basic auth and severity-based impact, and resolves incidents on close", async () => {
    const creds = { instance_url: base, username: "svc", password: "pw", table_name: "incident" as const, assignment_group: "SecOps" };
    const rec = await createServiceNowRecord(creds, { title: "SQLi", description: "d", severity: "critical", correlationId: "r1" });
    expect(rec).toEqual({ sysId: "a".repeat(32), number: "INC0010001" });
    const create = seen.at(-1)!;
    expect(create.url).toMatch(/^\/api\/now\/table\/incident/);
    expect(create.auth).toBe(`Basic ${Buffer.from("svc:pw").toString("base64")}`);
    expect(JSON.parse(create.body)).toMatchObject({ short_description: "[Unpatched] SQLi", impact: "1", urgency: "1", correlation_id: "r1", assignment_group: "SecOps" });

    await closeServiceNowRecord(creds, rec.sysId, "Resolved in Unpatched", true);
    expect(JSON.parse(seen.at(-1)!.body)).toMatchObject({ state: "6", close_code: "Solved (Permanently)", work_notes: "Resolved in Unpatched" });
    await closeServiceNowRecord({ ...creds, table_name: "sn_si_incident" }, rec.sysId, "note", true);
    expect(JSON.parse(seen.at(-1)!.body)).toEqual({ work_notes: "note" }); // SIR states are customer-specific: note only
  });

  it("the inbound token is compared in constant time, and the Business Rule posts it", () => {
    expect(verifyServiceNowToken("abc", "abc")).toBe(true);
    expect(verifyServiceNowToken("abc", "abx")).toBe(false);
    expect(businessRuleScript("https://app/api/webhooks/servicenow/o")).toContain("X-Unpatched-Token");
  });
});
