import type { OrganizationResearcherProgramRelationship } from "@/types/organization";

/**
 * Derives one plain-language relationship summary from a researcher's full, real
 * per-program relationship array -- never a stored/collapsed status. The array itself
 * (list_researchers_for_organization) is authoritative; this is a pure display function
 * over it, so a mixed active/suspended/revoked researcher never loses the fact that they
 * are suspended or revoked somewhere just because they're also active elsewhere.
 *
 * Rules (in priority order):
 * - Any "active" relationship leads: "Active in N program(s)", with a qualifier for any
 *   suspended/revoked relationship that also exists (never hidden once an active one
 *   exists).
 * - No active, but at least one "suspended": "Suspended", with a revoked-count qualifier
 *   if applicable.
 * - All relationships "revoked": "Revoked", unqualified (nothing else to qualify against).
 */
export function summarizeOrganizationResearcherRelationship(programs: OrganizationResearcherProgramRelationship[]): string {
  const activeCount = programs.filter((p) => p.status === "active").length;
  const suspendedCount = programs.filter((p) => p.status === "suspended").length;
  const revokedCount = programs.filter((p) => p.status === "revoked").length;

  if (activeCount > 0) {
    const qualifiers: string[] = [];
    if (suspendedCount > 0) qualifiers.push(`suspended in ${suspendedCount}`);
    if (revokedCount > 0) qualifiers.push(`revoked in ${revokedCount}`);
    const base = `Active in ${activeCount} program${activeCount === 1 ? "" : "s"}`;
    return qualifiers.length > 0 ? `${base} · ${qualifiers.join(" · ")}` : base;
  }

  if (suspendedCount > 0) {
    return revokedCount > 0 ? `Suspended · revoked in ${revokedCount}` : "Suspended";
  }

  return "Revoked";
}

/** The single dominant relationship state for this researcher, by the exact same
 * priority as the summary above (any active wins, else any suspended, else revoked) --
 * used to pick one status dot's color/pulse rather than inventing a second derivation
 * that could disagree with the text summary. */
export function dominantOrganizationResearcherRelationshipStatus(programs: OrganizationResearcherProgramRelationship[]): "active" | "suspended" | "revoked" {
  if (programs.some((p) => p.status === "active")) return "active";
  if (programs.some((p) => p.status === "suspended")) return "suspended";
  return "revoked";
}
