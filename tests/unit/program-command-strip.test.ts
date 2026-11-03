import { describe, expect, it } from "vitest";
import { attentionItems, summarizeProgram, type ProgramCommandFacts } from "../../components/programs/program-command-strip";

const facts = (over: Partial<ProgramCommandFacts> = {}): ProgramCommandFacts => ({
  breakdown: [],
  resolution: null,
  sla: null,
  spend: [],
  activeResearchers: 0,
  scopeCount: 0,
  accessRequests: 0,
  pendingInvitations: 0,
  hasPolicy: false,
  policyVersion: null,
  ...over,
});

describe("program command strip", () => {
  it("counts open, critical, acceptance and SLA only from real rows", () => {
    const s = summarizeProgram(facts({
      breakdown: [
        { severity: "critical", status: "new", count: 2 },
        { severity: "high", status: "accepted", count: 1 },
        { severity: "low", status: "resolved", count: 3 },
        { severity: "low", status: "duplicate", count: 4 },
      ],
      sla: { programId: "p", reportCount: 6, firstResponse: { tracked: 4, breached: 1 }, triage: { tracked: 4, breached: 0 }, resolution: { tracked: 2, breached: 0 }, medianFirstResponseHours: 2 },
    }));
    expect(s).toMatchObject({ open: 3, total: 10, openCritical: 2, openHigh: 1, acceptancePercent: 50, slaBreached: 1, slaMetPercent: 90 });
  });

  it("has no numbers to invent when there is no data", () => {
    expect(summarizeProgram(facts())).toMatchObject({ open: 0, acceptancePercent: null, slaMetPercent: null });
    expect(attentionItems(facts({ scopeCount: 1, hasPolicy: true }), "/b", "active")).toEqual([]);
  });

  it("flags an empty draft", () => {
    expect(attentionItems(facts(), "/b", "draft").map((i) => i.id)).toEqual(["scope", "policy"]);
  });
});
