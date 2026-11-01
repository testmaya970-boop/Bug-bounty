import type { ReportSeverity, ReportStatus } from "../../types/report";
import type { AnalyticsFilters, SeverityFilterKey } from "./filters";

export const SEVERITY_KEYS: SeverityFilterKey[] = [
  "critical",
  "high",
  "medium",
  "low",
  "none",
  "unrated",
];

export interface Money {
  currency: "INR" | "USD";
  minorUnits: number;
}

export interface ReportFact {
  reportId: string;
  title: string;
  programId: string;
  programName: string;
  researcherId: string;
  researcherName: string;
  assetId: string | null;
  assetLabel: string | null;
  assetType: string | null;
  severity: ReportSeverity | null;
  status: ReportStatus;
  cvssScore: number | null;
  submittedAt: string;
  firstResponseAt: string | null;
  triagedAt: string | null;
  resolvedAt: string | null;
  slaMet: boolean | null;
  awardedMinorUnits: number | null;
  paidMinorUnits: number | null;
  currency: "INR" | "USD" | null;
}

export interface ScopeAssetFact {
  assetId: string;
  assetLabel: string;
  assetType: string;
  inScope: boolean;
}

export interface ComputedAnalytics {
  kpis: {
    total: number;
    valid: number;
    validRate: number | null;
    open: number;
    criticalHighOpen: number;
    mttaHours: number | null;
    mttrDays: number | null;
    medianTriageHours: number | null;
    slaCompliance: number | null;
    slaMet: number;
    slaBreached: number;
    paid: Money[];
    awarded: Money[];
    assetCoverage: number | null;
    assetsCovered: number;
    assetsInScope: number;
    researchers: number;
  };
  weekly: ({
    weekStart: string;
    total: number;
    mttaHours: number | null;
  } & Record<SeverityFilterKey, number>)[];
  byStatus: Map<ReportStatus, number>;
  bySeverity: Record<SeverityFilterKey, number>;
  programs: {
    programId: string;
    programName: string;
    healthScore: number;
    healthLabel: "Healthy" | "Watch" | "At risk";
    total: number;
    open: number;
    criticalHighOpen: number;
    agingOver30Days: number;
    slaCompliance: number | null;
    mttaHours: number | null;
    paid: Money[];
  }[];
  researchers: {
    researcherId: string;
    researcherName: string;
    total: number;
    valid: number;
    validRate: number | null;
    critical: number;
    high: number;
    averageCvss: number | null;
    paid: Money[];
    lastSubmittedAt: string;
  }[];
  assets: {
    assetId: string;
    assetLabel: string;
    assetType: string;
    inScope: boolean;
    reports: number;
    valid: number;
    open: number;
  }[];
}

const OPEN_STATUSES = new Set<ReportStatus>([
  "new",
  "triaging",
  "needs_information",
  "accepted",
]);

const VALID_STATUSES = new Set<ReportStatus>(["accepted", "resolved"]);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const val =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
  return Math.round(val * 10) / 10;
}

function sumMoney(
  items: { currency: "INR" | "USD" | null; amount: number | null }[],
): Money[] {
  const totals = new Map<"INR" | "USD", number>();
  for (const item of items) {
    if (!item.currency || !item.amount || item.amount <= 0) continue;
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.amount);
  }
  return Array.from(totals.entries()).map(([currency, minorUnits]) => ({
    currency,
    minorUnits,
  }));
}

export function computeAnalytics(
  facts: ReportFact[],
  scopeAssets: ScopeAssetFact[],
  _filters: AnalyticsFilters,
  now: Date = new Date(),
): ComputedAnalytics {
  const byStatus = new Map<ReportStatus, number>([
    ["new", 0],
    ["triaging", 0],
    ["needs_information", 0],
    ["accepted", 0],
    ["duplicate", 0],
    ["informative", 0],
    ["not_applicable", 0],
    ["resolved", 0],
    ["rejected", 0],
  ]);
  const bySeverity: Record<SeverityFilterKey, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    none: 0,
    unrated: 0,
  };

  let valid = 0;
  let closed = 0;
  let open = 0;
  let criticalHighOpen = 0;
  let slaMet = 0;
  let slaBreached = 0;
  const mttaList: number[] = [];
  const mttrList: number[] = [];
  const triageList: number[] = [];

  for (const f of facts) {
    byStatus.set(f.status, (byStatus.get(f.status) ?? 0) + 1);
    const sevKey: SeverityFilterKey = f.severity ?? "unrated";
    bySeverity[sevKey] = (bySeverity[sevKey] ?? 0) + 1;

    const isOpen = OPEN_STATUSES.has(f.status);
    if (isOpen) {
      open++;
      if (f.severity === "critical" || f.severity === "high") {
        criticalHighOpen++;
      }
    } else {
      closed++;
    }
    if (VALID_STATUSES.has(f.status)) valid++;

    if (f.slaMet === true) slaMet++;
    else if (f.slaMet === false) slaBreached++;

    const subMs = new Date(f.submittedAt).getTime();
    if (f.firstResponseAt) {
      const hrs = (new Date(f.firstResponseAt).getTime() - subMs) / 3_600_000;
      if (hrs >= 0) mttaList.push(hrs);
    }
    if (f.triagedAt) {
      const hrs = (new Date(f.triagedAt).getTime() - subMs) / 3_600_000;
      if (hrs >= 0) triageList.push(hrs);
    }
    if (f.resolvedAt) {
      const days = (new Date(f.resolvedAt).getTime() - subMs) / 86_400_000;
      if (days >= 0) mttrList.push(days);
    }
  }

  const slaTotal = slaMet + slaBreached;
  const slaCompliance =
    slaTotal > 0 ? Math.round((slaMet / slaTotal) * 100) : null;

  const inScopeSet = new Set(
    scopeAssets.filter((a) => a.inScope).map((a) => a.assetId),
  );
  const coveredSet = new Set(
    facts
      .map((f) => f.assetId)
      .filter((id): id is string => Boolean(id && inScopeSet.has(id))),
  );
  const assetsInScope = inScopeSet.size;
  const assetsCovered = coveredSet.size;
  const assetCoverage =
    assetsInScope > 0 ? Math.round((assetsCovered / assetsInScope) * 100) : null;

  // Weekly buckets
  const weekMap = new Map<
    string,
    {
      severities: Record<SeverityFilterKey, number>;
      total: number;
      mtta: number[];
    }
  >();
  for (const f of facts) {
    const d = new Date(f.submittedAt);
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    const monday = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff),
    );
    const key = monday.toISOString().slice(0, 10);
    let bucket = weekMap.get(key);
    if (!bucket) {
      bucket = {
        severities: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          none: 0,
          unrated: 0,
        },
        total: 0,
        mtta: [],
      };
      weekMap.set(key, bucket);
    }
    const sev: SeverityFilterKey = f.severity ?? "unrated";
    bucket.severities[sev]++;
    bucket.total++;
    if (f.firstResponseAt) {
      const hrs =
        (new Date(f.firstResponseAt).getTime() - d.getTime()) / 3_600_000;
      if (hrs >= 0) bucket.mtta.push(hrs);
    }
  }

  const weekly = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, b]) => ({
      weekStart,
      total: b.total,
      mttaHours: median(b.mtta),
      ...b.severities,
    }));

  // Programs breakdown
  const progMap = new Map<string, { name: string; facts: ReportFact[] }>();
  for (const f of facts) {
    let p = progMap.get(f.programId);
    if (!p) {
      p = { name: f.programName, facts: [] };
      progMap.set(f.programId, p);
    }
    p.facts.push(f);
  }

  const programs = Array.from(progMap.entries()).map(([programId, p]) => {
    const pOpen = p.facts.filter((f) => OPEN_STATUSES.has(f.status));
    const pCritHigh = pOpen.filter(
      (f) => f.severity === "critical" || f.severity === "high",
    ).length;
    const pAging = pOpen.filter(
      (f) => now.getTime() - new Date(f.submittedAt).getTime() > 30 * 86_400_000,
    ).length;
    const pMet = p.facts.filter((f) => f.slaMet === true).length;
    const pMissed = p.facts.filter((f) => f.slaMet === false).length;
    const pSla =
      pMet + pMissed > 0
        ? Math.round((pMet / (pMet + pMissed)) * 100)
        : null;
    const pMtta = median(
      p.facts
        .filter((f) => f.firstResponseAt)
        .map(
          (f) =>
            (new Date(f.firstResponseAt!).getTime() -
              new Date(f.submittedAt).getTime()) /
            3_600_000,
        ),
    );
    const slaPenalty = pSla === null ? 0 : Math.round(((100 - pSla) / 100) * 40);
    const agingPenalty = Math.min(30, pAging * 10);
    const critPenalty = Math.min(30, pCritHigh * 10);
    const healthScore = Math.max(
      0,
      100 - slaPenalty - agingPenalty - critPenalty,
    );
    const healthLabel: "Healthy" | "Watch" | "At risk" =
      healthScore >= 80 ? "Healthy" : healthScore >= 60 ? "Watch" : "At risk";

    return {
      programId,
      programName: p.name,
      healthScore,
      healthLabel,
      total: p.facts.length,
      open: pOpen.length,
      criticalHighOpen: pCritHigh,
      agingOver30Days: pAging,
      slaCompliance: pSla,
      mttaHours: pMtta,
      paid: sumMoney(
        p.facts.map((f) => ({
          currency: f.currency,
          amount: f.paidMinorUnits,
        })),
      ),
    };
  });

  // Researchers breakdown
  const resMap = new Map<string, { name: string; facts: ReportFact[] }>();
  for (const f of facts) {
    let r = resMap.get(f.researcherId);
    if (!r) {
      r = { name: f.researcherName, facts: [] };
      resMap.set(f.researcherId, r);
    }
    r.facts.push(f);
  }

  const researchers = Array.from(resMap.entries())
    .map(([researcherId, r]) => {
      const rValid = r.facts.filter((f) => VALID_STATUSES.has(f.status)).length;
      const cvss = r.facts
        .map((f) => f.cvssScore)
        .filter((c): c is number => c !== null);
      const avgCvss =
        cvss.length > 0
          ? Math.round(
              (cvss.reduce((a, b) => a + b, 0) / cvss.length) * 10,
            ) / 10
          : null;
      const latest = r.facts
        .map((f) => f.submittedAt)
        .sort()
        .at(-1)!;
      return {
        researcherId,
        researcherName: r.name,
        total: r.facts.length,
        valid: rValid,
        validRate:
          r.facts.length > 0
            ? Math.round((rValid / r.facts.length) * 100)
            : null,
        critical: r.facts.filter((f) => f.severity === "critical").length,
        high: r.facts.filter((f) => f.severity === "high").length,
        averageCvss: avgCvss,
        paid: sumMoney(
          r.facts.map((f) => ({
            currency: f.currency,
            amount: f.paidMinorUnits,
          })),
        ),
        lastSubmittedAt: latest,
      };
    })
    .sort((a, b) => b.valid - a.valid || b.total - a.total);

  // Assets breakdown
  const assetMap = new Map<
    string,
    {
      assetLabel: string;
      assetType: string;
      inScope: boolean;
      facts: ReportFact[];
    }
  >();
  for (const a of scopeAssets) {
    assetMap.set(a.assetId, {
      assetLabel: a.assetLabel,
      assetType: a.assetType,
      inScope: a.inScope,
      facts: [],
    });
  }
  for (const f of facts) {
    if (!f.assetId) continue;
    let entry = assetMap.get(f.assetId);
    if (!entry) {
      entry = {
        assetLabel: f.assetLabel ?? f.assetId,
        assetType: f.assetType ?? "other",
        inScope: false,
        facts: [],
      };
      assetMap.set(f.assetId, entry);
    }
    entry.facts.push(f);
  }

  const assets = Array.from(assetMap.entries()).map(([assetId, a]) => ({
    assetId,
    assetLabel: a.assetLabel,
    assetType: a.assetType,
    inScope: a.inScope,
    reports: a.facts.length,
    valid: a.facts.filter((f) => VALID_STATUSES.has(f.status)).length,
    open: a.facts.filter((f) => OPEN_STATUSES.has(f.status)).length,
  }));

  return {
    kpis: {
      total: facts.length,
      valid,
      validRate: closed > 0 ? Math.round((valid / closed) * 100) : null,
      open,
      criticalHighOpen,
      mttaHours: median(mttaList),
      mttrDays: median(mttrList),
      medianTriageHours: median(triageList),
      slaCompliance,
      slaMet,
      slaBreached,
      paid: sumMoney(
        facts.map((f) => ({ currency: f.currency, amount: f.paidMinorUnits })),
      ),
      awarded: sumMoney(
        facts.map((f) => ({
          currency: f.currency,
          amount: f.awardedMinorUnits,
        })),
      ),
      assetCoverage,
      assetsCovered,
      assetsInScope,
      researchers: resMap.size,
    },
    weekly,
    byStatus,
    bySeverity,
    programs,
    researchers,
    assets,
  };
}
