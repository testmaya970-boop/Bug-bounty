import React from "react";
import type { AssetInventoryItem } from "../../types/scope";
import type { RewardGroup } from "../../types/reward-groups";
import { RewardGroupBadge } from "../rewards/reward-groups";
import { calculateAttackSurfaceKpis, getAssetIntelligence } from "../../lib/assets-intelligence";
import { 
  ShieldCheck, 
  AlertTriangle, 
  Layers, 
  Crosshair, 
  Bug, 
  Flame, 
  Activity, 
  GlobeLock,
  ArrowUpRight
} from "lucide-react";

type Bucket = "critical" | "exposed" | "remediated" | "untested";
const BUCKETS: { key: Bucket; label: string; hint: string; bar: string; text: string; bg: string }[] = [
  { key: "critical", label: "High Exposure", hint: "3+ open findings", bar: "bg-[#DC2626]", text: "text-[#DC2626]", bg: "bg-[#FEF2F2]" },
  { key: "exposed", label: "Exposed", hint: "1-2 open findings", bar: "bg-[#F59E0B]", text: "text-[#D97706]", bg: "bg-[#FFFBEB]" },
  { key: "remediated", label: "Remediated", hint: "findings resolved", bar: "bg-[#10B981]", text: "text-[#059669]", bg: "bg-[#ECFDF5]" },
  { key: "untested", label: "Untested", hint: "no findings filed", bar: "bg-[#94A3B8]", text: "text-[#64748B]", bg: "bg-[#F8FAFC]" },
];

function bucketOf(a: AssetInventoryItem): Bucket {
  if (a.openReports >= 3) return "critical";
  if (a.openReports > 0) return "exposed";
  return a.totalReports > 0 ? "remediated" : "untested";
}

export function AssetPosture({
  assets,
  groupByAsset,
  groups,
  more,
}: {
  assets: AssetInventoryItem[];
  groupByAsset: Record<string, string | null>;
  groups: RewardGroup[];
  more: boolean;
}) {
  if (assets.length === 0) return null;

  const kpis = calculateAttackSurfaceKpis(assets, groups, groupByAsset);
  const byId = new Map(groups.map((g) => [g.id, g]));

  const counts = Object.fromEntries(BUCKETS.map((b) => [b.key, 0])) as Record<Bucket, number>;
  for (const a of assets) counts[bucketOf(a)] += 1;

  // Rank groups by what they pay for a critical finding; top one holds the crown jewels.
  const rank = new Map(
    [...groups]
      .sort((x, y) => (y.bounties.critical?.max ?? 0) - (x.bounties.critical?.max ?? 0))
      .map((g, i) => [g.id, i]),
  );
  const top1 = [...groups].sort((x, y) => (rank.get(x.id) ?? 0) - (rank.get(y.id) ?? 0))[0];
  const rankOf = (id: string) => rank.get(groupByAsset[id] ?? "") ?? 99;

  const topFix = [...assets]
    .filter((a) => a.openReports > 0)
    .sort((x, y) => y.openReports - x.openReports || rankOf(x.id) - rankOf(y.id))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      {/* 6 Executive KPI Metric Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {/* Card 1: Total Attack Surface */}
        <div className="group relative rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(16,24,40,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#667085]">Total Assets</span>
            <span className="rounded-lg bg-[#EFF6FF] p-1.5 text-[#2563EB]">
              <Layers className="size-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-[#111827] tabular-nums">{kpis.totalAssets}</span>
            {more && <span className="text-[11px] font-medium text-[#667085]">(page 1)</span>}
          </div>
          <p className="mt-1 flex items-center text-xs text-[#667085]">
            <span className="font-semibold text-[#111827]">{kpis.publicExposedAssets}</span>
            <span className="ml-1">public ingress</span>
          </p>
        </div>

        {/* Card 2: Verified Assets */}
        <div className="group relative rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(16,24,40,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#667085]">Verified</span>
            <span className="rounded-lg bg-[#ECFDF5] p-1.5 text-[#059669]">
              <ShieldCheck className="size-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-[#111827] tabular-nums">{kpis.verifiedPercent}%</span>
          </div>
          <p className="mt-1 flex items-center text-xs text-[#059669]">
            <span className="inline-block size-1.5 rounded-full bg-[#10B981] mr-1.5 animate-pulse" />
            <span>{kpis.verifiedAssets} DNS/TLS verified</span>
          </p>
        </div>

        {/* Card 3: High Risk Targets (Elevated Weight) */}
        <div className="group relative rounded-2xl border border-[#FDE68A] bg-[#FFFDF5] p-4 shadow-[0_2px_4px_rgba(245,158,11,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(245,158,11,0.12)] ring-1 ring-[#F59E0B]/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#B45309]">High Risk</span>
            <span className="rounded-lg bg-[#FEF3C7] p-1.5 text-[#D97706]">
              <Flame className="size-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-[#92400E] tabular-nums">{kpis.highRiskAssets}</span>
            <span className="text-[11px] font-semibold text-[#B45309]">targets</span>
          </div>
          <p className="mt-1 text-xs text-[#B45309]">
            {kpis.criticalRiskAssets} critical exposure
          </p>
        </div>

        {/* Card 4: In Scope Targets */}
        <div className="group relative rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(16,24,40,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#667085]">In Scope</span>
            <span className="rounded-lg bg-[#F3E8FF] p-1.5 text-[#7C3AED]">
              <Crosshair className="size-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-[#111827] tabular-nums">{kpis.inScopeAssets}</span>
            <span className="text-[11px] text-[#667085]">of {kpis.totalAssets}</span>
          </div>
          <p className="mt-1 text-xs text-[#667085]">
            Actively defended targets
          </p>
        </div>

        {/* Card 5: Open Findings */}
        <div className="group relative rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(16,24,40,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#667085]">Open Findings</span>
            <span className={`rounded-lg p-1.5 ${kpis.totalOpenFindings > 0 ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#F0FDF4] text-[#16A34A]"}`}>
              <Bug className="size-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold tracking-tight tabular-nums ${kpis.totalOpenFindings > 0 ? "text-[#DC2626]" : "text-[#111827]"}`}>
              {kpis.totalOpenFindings}
            </span>
            <span className="text-[11px] text-[#667085]">active</span>
          </div>
          <p className="mt-1 text-xs text-[#667085]">
            {counts.critical + counts.exposed} assets impacted
          </p>
        </div>

        {/* Card 6: Test Coverage */}
        <div className="group relative rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(16,24,40,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#667085]">Coverage</span>
            <span className="rounded-lg bg-[#EFF6FF] p-1.5 text-[#2563EB]">
              <Activity className="size-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-[#111827] tabular-nums">{kpis.coveragePercent}%</span>
          </div>
          <p className="mt-1 text-xs text-[#667085]">
            {kpis.testedAssets} of {kpis.totalAssets} reported on
          </p>
        </div>
      </div>

      {/* Posture Distribution & High Priority Remediation */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Exposure Distribution Bar */}
        <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:col-span-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#111827]">Attack Surface Exposure</h3>
              <p className="text-xs text-[#667085]">Vulnerability density categorized by active finding counts</p>
            </div>
            {top1 && (
              <span className="rounded-full bg-[#F3E8FF] px-2.5 py-0.5 text-xs font-semibold text-[#7C3AED]">
                Crown Jewels: {top1.name}
              </span>
            )}
          </div>

          {/* Stacked Progress Bar */}
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-[#F1F5F9] p-0.5" role="img" aria-label="Exposure Distribution">
            {BUCKETS.map((b) =>
              counts[b.key] > 0 ? (
                <span
                  key={b.key}
                  className={`h-full rounded-full transition-all duration-300 ${b.bar}`}
                  style={{ width: `${(counts[b.key] / assets.length) * 100}%` }}
                  title={`${b.label}: ${counts[b.key]} assets`}
                />
              ) : null
            )}
          </div>

          {/* Legend Badges */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BUCKETS.map((b) => (
              <div key={b.key} className={`flex items-center gap-2 rounded-xl p-2 ${b.bg} border border-[#E7EAF0]/60`}>
                <span className={`size-2.5 shrink-0 rounded-full ${b.bar}`} />
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-medium text-[#475467] truncate">{b.label}</span>
                    <span className={`text-xs font-bold tabular-nums ${b.text}`}>{counts[b.key]}</span>
                  </div>
                  <p className="text-[10px] text-[#667085] truncate">{b.hint}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Fix First Quick Strip */}
        <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:col-span-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#111827]">Remediation Priority</h3>
              <p className="text-xs text-[#667085]">Highest risk targets with active open vulnerabilities</p>
            </div>
            <span className="text-xs font-semibold text-[#D97706] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded-full">
              Action Required
            </span>
          </div>

          <div className="mt-3">
            {topFix.length === 0 ? (
              <div className="flex h-24 items-center justify-center rounded-xl bg-[#F8FAFC] text-center text-xs text-[#667085]">
                <ShieldCheck className="mr-1.5 size-4 text-[#10B981]" />
                All active inventory targets are currently clean of open vulnerabilities.
              </div>
            ) : (
              <div className="divide-y divide-[#F1F5F9]">
                {topFix.map((asset) => {
                  const intel = getAssetIntelligence(asset, byId.get(groupByAsset[asset.id] ?? "") ?? null);
                  return (
                    <div key={asset.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`inline-flex items-center justify-center rounded-lg px-2 py-1 font-mono text-[11px] font-bold ${
                            asset.openReports >= 2
                              ? "bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]"
                              : "bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]"
                          }`}
                        >
                          {asset.openReports} open
                        </span>
                        <div className="min-w-0">
                          <span className="block truncate font-mono font-medium text-[#111827]">
                            {asset.displayIdentifier}
                          </span>
                          <span className="text-[11px] text-[#667085]">
                            {intel.ownerTeam} · {intel.exposureType}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {byId.get(groupByAsset[asset.id] ?? "") && (
                          <RewardGroupBadge
                            name={byId.get(groupByAsset[asset.id]!)!.name}
                            color={byId.get(groupByAsset[asset.id]!)!.color}
                          />
                        )}
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          intel.riskSeverity === "critical" ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#FFFBEB] text-[#D97706]"
                        }`}>
                          Score {intel.riskScore}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
