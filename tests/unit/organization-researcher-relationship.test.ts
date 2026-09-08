import { describe, expect, it } from "vitest";
import { summarizeOrganizationResearcherRelationship } from "../../lib/organization-researcher-relationship";
import type { OrganizationResearcherProgramRelationship } from "../../types/organization";

function program(programId: string, status: OrganizationResearcherProgramRelationship["status"]): OrganizationResearcherProgramRelationship {
  return { programId, programName: `Program ${programId}`, status };
}

describe("summarizeOrganizationResearcherRelationship: a pure display derivation over the real per-program array -- never a stored/collapsed status", () => {
  it("a single active program reads as 'Active in 1 program', singular", () => {
    expect(summarizeOrganizationResearcherRelationship([program("a", "active")])).toBe("Active in 1 program");
  });

  it("multiple active programs are never collapsed to bare 'Active' -- the count itself is the signal", () => {
    expect(summarizeOrganizationResearcherRelationship([program("a", "active"), program("b", "active"), program("c", "active")])).toBe("Active in 3 programs");
  });

  it("active + suspended keeps both facts visible, never hiding the suspended relationship once an active one exists", () => {
    expect(summarizeOrganizationResearcherRelationship([program("a", "active"), program("b", "suspended")])).toBe("Active in 1 program · suspended in 1");
  });

  it("active + revoked keeps both facts visible", () => {
    expect(summarizeOrganizationResearcherRelationship([program("a", "active"), program("b", "revoked")])).toBe("Active in 1 program · revoked in 1");
  });

  it("active + suspended + revoked all together shows every qualifier", () => {
    expect(summarizeOrganizationResearcherRelationship([program("a", "active"), program("b", "suspended"), program("c", "revoked")])).toBe("Active in 1 program · suspended in 1 · revoked in 1");
  });

  it("suspended + revoked, no active, leads with Suspended and qualifies the revoked count", () => {
    expect(summarizeOrganizationResearcherRelationship([program("a", "suspended"), program("b", "revoked")])).toBe("Suspended · revoked in 1");
  });

  it("suspended alone, no active and no revoked, is unqualified", () => {
    expect(summarizeOrganizationResearcherRelationship([program("a", "suspended")])).toBe("Suspended");
  });

  it("all programs revoked reads as bare 'Revoked' -- nothing left to qualify against", () => {
    expect(summarizeOrganizationResearcherRelationship([program("a", "revoked"), program("b", "revoked")])).toBe("Revoked");
  });

  it("a single revoked program is also bare 'Revoked'", () => {
    expect(summarizeOrganizationResearcherRelationship([program("a", "revoked")])).toBe("Revoked");
  });
});
