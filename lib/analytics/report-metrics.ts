import type { ReportSeverity, ReportStatus } from "../../types/report";

// Every Explore KPI and every export is computed here from the same per-report rows
// (public.list_organization_report_facts), so a number on screen and in a file always agree.
// Pure: no I/O, `now` passed in, so it is unit-tested directly.

export type ReportFact = {
  reportId: string;
  title: string;
  programId: string;
  programName: string;
  assetId: string | null;
  assetLabel: string | null;
  assetType: string;
  severity: ReportSeverity | null;
  cvssScore: number | null;
  status: ReportStatus;
  researcherId: string;
  researcherName: string | null;
  submittedAt: string;
  firstResponseAt: string | null;
  triagedAt: string | null;
  closedAt: string | null;
  firstResponseTargetHours: number | null;
  triageTargetHours: number | null;
  resolutionTargetDays: number | null;
  bountyCurrency: string | null;
  bountyAwardedMinorUnits: number | null;
  bountyPaidMinorUnits: number;
};

export type ScopeAsset = { assetId: string; assetLabel: string; assetType: string; programNames: string[] };

export type Money = { currency: string; minorUnits: number };

export const VALID_STATUSES: ReportStatus[] = ["accepted", "resolved"];
export const OPEN_STATUSES: ReportStatus[] = ["new", "triaging", "needs_information", "accepted"];
export const SEVERITY_KEYS = ["critical", "high", "medium", "low", "none", "unrated"] as const;
export type SeverityKey = (typeof SEVERITY_KEYS)[number];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const ms = (iso: string) => new Date(iso).getTime();
const severityKey = (f: ReportFact): SeverityKey => f.severity ?? "unrated";
const isOpen = (f: ReportFact) => OPEN_STATUSES.includes(f.status);
const isValid = (f: ReportFact) => VALID_STATUSES.includes(f.status);

/** One SLA checkpoint: met, breached, or still running (not counted either way). */
function checkpoint(startIso: string, doneIso: string | null, targetMs: number | null, now: number): "met" | "breached" | null {
  if (targetMs === null) return null;
  const due = ms(startIso) + targetMs;
  if (doneIso) return ms(doneIso) <= due ? "met" : "breached";
  return now > due ? "breached" : null;
}

function slaOf(f: ReportFact, now: number): { met: number; breached: number } {
  const marks = [
    checkpoint(f.submittedAt, f.firstResponseAt, f.firstResponseTargetHours === null ? null : f.firstResponseTargetHours * HOUR, now),
    checkpoint(f.submittedAt, f.triagedAt, f.triageTargetHours === null ? null : f.triageTargetHours * HOUR, now),
    checkpoint(f.submittedAt, f.closedAt, f.resolutionTargetDays === null ? null : f.resolutionTargetDays * DAY, now),
  ];
  return { met: marks.filter((m) => m === "met").length, breached: marks.filter((m) => m === "breached").length };
}

function sumMoney(rows: { currency: string | null; minorUnits: number | null }[]): Money[] {
  const by = new Map<string, number>();
  for (const r of rows) if (r.currency && r.minorUnits) by.set(r.currency, (by.get(r.currency) ?? 0) + r.minorUnits);
  return [...by].map(([currency, minorUnits]) => ({ currency, minorUnits })).sort((a, b) => b.minorUnits - a.minorUnits);
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Monday (UTC) of the week containing iso, as YYYY-MM-DD. */
export function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}

function weeksBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = ms(`${weekStart(`${from}T00:00:00Z`)}T00:00:00Z`); t <= ms(`${to}T00:00:00Z`); t += 7 * DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function summarize(facts: ReportFact[], now: number) {
  const sla = facts.reduce((acc, f) => {
    const s = slaOf(f, now);
    return { met: acc.met + s.met, breached: acc.breached + s.breached };
  }, { met: 0, breached: 0 });
  const responded = facts.filter((f) => f.firstResponseAt).map((f) => (ms(f.firstResponseAt!) - ms(f.submittedAt)) / HOUR);
  const triaged = facts.filter((f) => f.triagedAt).map((f) => (ms(f.triagedAt!) - ms(f.submittedAt)) / HOUR);
  const resolved = facts.filter((f) => f.status === "resolved" && f.closedAt).map((f) => (ms(f.closedAt!) - ms(f.submittedAt)) / DAY);
  const valid = facts.filter(isValid).length;
  return {
    total: facts.length,
    valid,
    validRate: pct(valid, facts.filter((f) => f.status !== "new" && f.status !== "triaging" && f.status !== "needs_information").length),
    open: facts.filter(isOpen).length,
    criticalHighOpen: facts.filter((f) => isOpen(f) && (f.severity === "critical" || f.severity === "high")).length,
    mttaHours: median(responded),
    medianTriageHours: median(triaged),
    mttrDays: median(resolved),
    slaMet: sla.met,
    slaBreached: sla.breached,
    slaCompliance: pct(sla.met, sla.met + sla.breached),
  };
}

export type ProgramHealth = ReturnType<typeof summarize> & {
  programId: string;
  programName: string;
  agingOver30Days: number;
  paid: Money[];
  healthScore: number;
  healthLabel: "Healthy" | "Watch" | "At risk";
};

/** 100, minus up to 40 for missed SLAs, 30 for open reports older than 30 days, 30 for open critical/high. */
export function healthScore(s: { slaMet: number; slaBreached: number; open: number; criticalHighOpen: number }, agingOver30Days: number): number {
  const breachRate = s.slaMet + s.slaBreached > 0 ? s.slaBreached / (s.slaMet + s.slaBreached) : 0;
  const agingShare = s.open > 0 ? agingOver30Days / s.open : 0;
  return Math.max(0, Math.round(100 - breachRate * 40 - agingShare * 30 - Math.min(30, s.criticalHighOpen * 10)));
}

export function computeAnalytics(facts: ReportFact[], scopeAssets: ScopeAsset[], range: { from: string; to: string }, nowDate: Date = new Date()) {
  const now = nowDate.getTime();
  const kpis = summarize(facts, now);

  const weeks = weeksBetween(range.from, range.to);
  const weekly = weeks.map((week) => {
    const inWeek = facts.filter((f) => weekStart(f.submittedAt) === week);
    const counts = Object.fromEntries(SEVERITY_KEYS.map((k) => [k, inWeek.filter((f) => severityKey(f) === k).length])) as Record<SeverityKey, number>;
    return { weekStart: week, ...counts, total: inWeek.length, mttaHours: median(inWeek.filter((f) => f.firstResponseAt).map((f) => (ms(f.firstResponseAt!) - ms(f.submittedAt)) / HOUR)) };
  });

  const bySeverity = Object.fromEntries(SEVERITY_KEYS.map((k) => [k, facts.filter((f) => severityKey(f) === k).length])) as Record<SeverityKey, number>;
  const byStatus = new Map<ReportStatus, number>();
  for (const f of facts) byStatus.set(f.status, (byStatus.get(f.status) ?? 0) + 1);

  const group = <K extends string>(key: (f: ReportFact) => K) => {
    const m = new Map<K, ReportFact[]>();
    for (const f of facts) m.set(key(f), [...(m.get(key(f)) ?? []), f]);
    return m;
  };

  const programs = [...group((f) => f.programId)].map(([programId, rows]): ProgramHealth => {
    const s = summarize(rows, now);
    const agingOver30Days = rows.filter((f) => isOpen(f) && now - ms(f.submittedAt) > 30 * DAY).length;
    const score = healthScore(s, agingOver30Days);
    return {
      ...s,
      programId,
      programName: rows[0].programName,
      agingOver30Days,
      paid: sumMoney(rows.map((f) => ({ currency: f.bountyCurrency, minorUnits: f.bountyPaidMinorUnits }))),
      healthScore: score,
      healthLabel: score >= 80 ? "Healthy" : score >= 60 ? "Watch" : "At risk",
    };
  }).sort((a, b) => a.healthScore - b.healthScore || b.open - a.open);

  const researchers = [...group((f) => f.researcherId)].map(([researcherId, rows]) => {
    const valid = rows.filter(isValid);
    const scored = valid.map((f) => f.cvssScore).filter((n): n is number => n !== null);
    return {
      researcherId,
      researcherName: rows[0].researcherName ?? "Researcher",
      total: rows.length,
      valid: valid.length,
      validRate: pct(valid.length, rows.filter((f) => !["new", "triaging", "needs_information"].includes(f.status)).length),
      critical: valid.filter((f) => f.severity === "critical").length,
      high: valid.filter((f) => f.severity === "high").length,
      averageCvss: scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null,
      paid: sumMoney(rows.map((f) => ({ currency: f.bountyCurrency, minorUnits: f.bountyPaidMinorUnits }))),
      lastSubmittedAt: rows.map((f) => f.submittedAt).sort().at(-1)!,
    };
  }).sort((a, b) => b.valid - a.valid || b.total - a.total);

  const reportedAssets = group((f) => f.assetId ?? "");
  const inScope = new Map(scopeAssets.map((a) => [a.assetId, a]));
  const assetIds = new Set([...inScope.keys(), ...[...reportedAssets.keys()].filter(Boolean)]);
  const assets = [...assetIds].map((assetId) => {
    const rows = reportedAssets.get(assetId) ?? [];
    const scope = inScope.get(assetId);
    return {
      assetId,
      assetLabel: scope?.assetLabel ?? rows[0]?.assetLabel ?? "Unknown asset",
      assetType: scope?.assetType ?? rows[0]?.assetType ?? "",
      inScope: Boolean(scope),
      reports: rows.length,
      valid: rows.filter(isValid).length,
      open: rows.filter(isOpen).length,
      lastReportAt: rows.map((f) => f.submittedAt).sort().at(-1) ?? null,
    };
  }).sort((a, b) => b.reports - a.reports || a.assetLabel.localeCompare(b.assetLabel));
  const covered = assets.filter((a) => a.inScope && a.reports > 0).length;

  return {
    range,
    kpis: {
      ...kpis,
      researchers: researchers.length,
      awarded: sumMoney(facts.map((f) => ({ currency: f.bountyCurrency, minorUnits: f.bountyAwardedMinorUnits }))),
      paid: sumMoney(facts.map((f) => ({ currency: f.bountyCurrency, minorUnits: f.bountyPaidMinorUnits }))),
      assetsInScope: inScope.size,
      assetsCovered: covered,
      assetCoverage: pct(covered, inScope.size),
    },
    weekly,
    bySeverity,
    byStatus,
    programs,
    researchers,
    assets,
  };
}

export type Analytics = ReturnType<typeof computeAnalytics>;
