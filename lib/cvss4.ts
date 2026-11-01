import { Cvss4P0 } from "ae-cvss-calculator";
import type { ReportSeverity } from "@/types/report";
import { cvssBand } from "@/lib/cvss";

// CVSS 4.0 base metrics (FIRST spec). The score comes from ae-cvss-calculator, which carries
// FIRST's lookup tables; this module only builds and validates vectors, so the same code
// previews the score in the browser and computes the stored one on the server.

export const CVSS4_METRICS = [
  { key: "AV", label: "Attack vector", values: [["N", "Network"], ["A", "Adjacent"], ["L", "Local"], ["P", "Physical"]] },
  { key: "AC", label: "Attack complexity", values: [["L", "Low"], ["H", "High"]] },
  { key: "AT", label: "Attack requirements", values: [["N", "None"], ["P", "Present"]] },
  { key: "PR", label: "Privileges required", values: [["N", "None"], ["L", "Low"], ["H", "High"]] },
  { key: "UI", label: "User interaction", values: [["N", "None"], ["P", "Passive"], ["A", "Active"]] },
  { key: "VC", label: "Confidentiality (vulnerable system)", values: [["H", "High"], ["L", "Low"], ["N", "None"]] },
  { key: "VI", label: "Integrity (vulnerable system)", values: [["H", "High"], ["L", "Low"], ["N", "None"]] },
  { key: "VA", label: "Availability (vulnerable system)", values: [["H", "High"], ["L", "Low"], ["N", "None"]] },
  { key: "SC", label: "Confidentiality (subsequent systems)", values: [["H", "High"], ["L", "Low"], ["N", "None"]] },
  { key: "SI", label: "Integrity (subsequent systems)", values: [["H", "High"], ["L", "Low"], ["N", "None"]] },
  { key: "SA", label: "Availability (subsequent systems)", values: [["H", "High"], ["L", "Low"], ["N", "None"]] },
] as const;

export type Cvss4Key = (typeof CVSS4_METRICS)[number]["key"];
export type Cvss4Metrics = Record<Cvss4Key, string>;

/** Same shape the database's check constraint accepts (202610220006). */
export const CVSS4_VECTOR_PATTERN = /^CVSS:4\.0\/AV:[NALP]\/AC:[LH]\/AT:[NP]\/PR:[NLH]\/UI:[NPA]\/VC:[HLN]\/VI:[HLN]\/VA:[HLN]\/SC:[HLN]\/SI:[HLN]\/SA:[HLN]$/;

export function buildCvss4Vector(m: Partial<Cvss4Metrics>): string | null {
  if (CVSS4_METRICS.some((metric) => !m[metric.key])) return null;
  const vector = "CVSS:4.0/" + CVSS4_METRICS.map((metric) => `${metric.key}:${m[metric.key]}`).join("/");
  return CVSS4_VECTOR_PATTERN.test(vector) ? vector : null;
}

export function parseCvss4Vector(vector: string | null | undefined): Partial<Cvss4Metrics> {
  if (!vector || !CVSS4_VECTOR_PATTERN.test(vector)) return {};
  return Object.fromEntries(vector.slice("CVSS:4.0/".length).split("/").map((part) => part.split(":") as [string, string])) as Partial<Cvss4Metrics>;
}

/** The base score for a valid base vector, or null. Validation first: the library accepts some
 * malformed vectors without complaint. */
export function cvss4Score(vector: string): number | null {
  if (!CVSS4_VECTOR_PATTERN.test(vector)) return null;
  try {
    const score = new Cvss4P0(vector).calculateScores().base;
    return typeof score === "number" && score >= 0 && score <= 10 ? Math.round(score * 10) / 10 : null;
  } catch {
    return null;
  }
}

/** v4.0 uses the same qualitative scale as v3.1. */
export function cvss4Band(score: number): ReportSeverity {
  return cvssBand(score);
}
