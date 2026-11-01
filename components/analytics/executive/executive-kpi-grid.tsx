"use client";

import React from "react";
import { 
  AlertOctagon, 
  Clock, 
  ShieldCheck, 
  Globe, 
  Users, 
  Coins, 
  Layers, 
  Gauge, 
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { EXECUTIVE_KPIS, ExecutiveKpi } from "../../../lib/mock/executive-analytics";

function getKpiIcon(id: string) {
  switch (id) {
    case "open-findings":
      return <AlertTriangle className="size-4 text-amber-600" />;
    case "critical-findings":
      return <AlertOctagon className="size-4 text-rose-600" />;
    case "mttr":
      return <Clock className="size-4 text-blue-600" />;
    case "sla-compliance":
      return <ShieldCheck className="size-4 text-emerald-600" />;
    case "verified-assets":
      return <Globe className="size-4 text-slate-700" />;
    case "active-programs":
      return <Layers className="size-4 text-indigo-600" />;
    case "researchers":
      return <Users className="size-4 text-violet-600" />;
    case "rewards-paid":
      return <Coins className="size-4 text-emerald-700" />;
    case "coverage":
      return <Globe className="size-4 text-teal-600" />;
    case "risk-score":
      return <Gauge className="size-4 text-slate-800" />;
    default:
      return <ShieldCheck className="size-4 text-slate-600" />;
  }
}

// Inline SVG micro sparkline generator
function MicroSparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 80;
  const height = 24;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const strokeColor = isPositive ? "#10b981" : "#f43f5e";

  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function ExecutiveKpiGrid({
  kpis = EXECUTIVE_KPIS,
  onKpiClick,
}: {
  kpis?: ExecutiveKpi[];
  onKpiClick?: (kpiId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {kpis.map((kpi) => {
        const isUp = kpi.delta.includes("▲");
        const isDown = kpi.delta.includes("▼");

        return (
          <div
            key={kpi.id}
            onClick={() => onKpiClick?.(kpi.id)}
            className="group relative flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md cursor-pointer"
          >
            {/* Header: Label + Icon */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium truncate">{kpi.label}</span>
                <span className="rounded-md bg-slate-50 p-1 group-hover:bg-slate-100 transition-colors">
                  {getKpiIcon(kpi.id)}
                </span>
              </div>

              {/* Value + Sparkline */}
              <div className="mt-2.5 flex items-baseline justify-between">
                <div className="text-xl font-bold tracking-tight text-slate-900 font-mono">
                  {kpi.value}
                </div>
                <MicroSparkline data={kpi.sparkline} isPositive={kpi.isPositive} />
              </div>
            </div>

            {/* Footer: Delta & Subtext */}
            <div className="mt-3 border-t border-slate-100 pt-2 text-[11px]">
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <span
                  className={`inline-flex items-center gap-0.5 font-semibold truncate ${
                    kpi.isPositive ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {isUp && <ArrowUpRight className="size-3 shrink-0" />}
                  {isDown && <ArrowDownRight className="size-3 shrink-0" />}
                  <span className="truncate">{kpi.delta}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono shrink-0">{kpi.benchmark}</span>
              </div>

              {kpi.subtext && (
                <div className="mt-1 text-[10.5px] text-slate-500 truncate">
                  {kpi.subtext}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
