import { Cvss3P1 } from "ae-cvss-calculator";
import type { ReportSeverity } from "@/types/report";
import { cvssBand } from "@/lib/cvss";
import { CVSS4_VECTOR_PATTERN, cvss4Score } from "@/lib/cvss4";

/**
 * A researcher's CVSS vector, either version: CVSS 4.0 (the default the composer builds) or a
 * pasted CVSS 3.1 vector (still common in program policies and older write-ups). Pure, so the
 * composer can preview the score, but the authority is the server action, which re-scores the
 * vector itself and never accepts a score from the browser. Base-metric vectors only, in the
 * spec's own metric order; both shapes match the database's check constraint (202610260004).
 */
export const CVSS31_VECTOR_PATTERN = /^CVSS:3\.1\/AV:[NALP]\/AC:[LH]\/PR:[NLH]\/UI:[NR]\/S:[UC]\/C:[HLN]\/I:[HLN]\/A:[HLN]$/;

export type ScoredCvss = { ok: true; version: "4.0" | "3.1"; vector: string; score: number; severity: ReportSeverity } | { ok: false; message: string };

export function scoreCvssVector(raw: string): ScoredCvss {
  const vector = raw.trim();
  if (vector.startsWith("CVSS:4.0/")) {
    if (!CVSS4_VECTOR_PATTERN.test(vector)) return { ok: false, message: "That CVSS 4.0 vector isn't complete or valid. Every base metric (AV, AC, AT, PR, UI, VC, VI, VA, SC, SI, SA) needs one value, in that order." };
    const score = cvss4Score(vector);
    return score === null ? { ok: false, message: "That CVSS 4.0 vector could not be scored." } : { ok: true, version: "4.0", vector, score, severity: cvssBand(score) };
  }
  if (vector.startsWith("CVSS:3.1/")) {
    if (!CVSS31_VECTOR_PATTERN.test(vector)) return { ok: false, message: "That CVSS 3.1 vector isn't complete or valid. Every base metric (AV, AC, PR, UI, S, C, I, A) needs one value, in that order." };
    try {
      const base = new Cvss3P1(vector).calculateScores().base;
      if (typeof base !== "number" || base < 0 || base > 10) return { ok: false, message: "That CVSS 3.1 vector could not be scored." };
      const score = Math.round(base * 10) / 10;
      return { ok: true, version: "3.1", vector, score, severity: cvssBand(score) };
    } catch {
      return { ok: false, message: "That CVSS 3.1 vector could not be scored." };
    }
  }
  return { ok: false, message: "Start the vector with CVSS:4.0/ or CVSS:3.1/." };
}
