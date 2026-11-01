"use client";

import React, { useState } from "react";
import { 
  Server, 
  Globe, 
  Cloud, 
  Smartphone, 
  Key, 
  Lock, 
  ArrowUpRight, 
  ShieldAlert,
  CheckCircle2,
  ExternalLink
} from "lucide-react";
import { ASSET_RISK_HEATMAP, AssetCategoryRisk } from "../../../lib/mock/executive-analytics";

function getCategoryIcon(id: string) {
  switch (id) {
    case "api":
      return <Server className="size-4 text-blue-600" />;
    case "web":
      return <Globe className="size-4 text-emerald-600" />;
    case "cloud":
      return <Cloud className="size-4 text-amber-600" />;
    case "mobile":
      return <Smartphone className="size-4 text-indigo-600" />;
    case "identity":
      return <Key className="size-4 text-teal-600" />;
    case "internal":
      return <Lock className="size-4 text-slate-700" />;
    default:
      return <Server className="size-4 text-slate-600" />;
  }
}

export function ExecutiveAssetHeatmap() {
  const [selectedAsset, setSelectedAsset] = useState<AssetCategoryRisk | null>(null);

  const totalAssets = ASSET_RISK_HEATMAP.reduce((acc, curr) => acc + curr.assetCount, 0);
  const avgCoverage = Math.round(
    ASSET_RISK_HEATMAP.reduce((acc, curr) => acc + curr.coveragePct, 0) / ASSET_RISK_HEATMAP.length
  );

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Attack Surface Risk
            </span>
            <span className="rounded bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200/50">
              {avgCoverage}% Continuous Ingest
            </span>
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Perimeter Asset Risk & Finding Density
          </h2>
        </div>

        <div className="text-xs text-slate-500 font-mono">
          <strong className="text-slate-900">{totalAssets}</strong> Total Verified Endpoints
        </div>
      </div>

      {/* Grid of categories */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ASSET_RISK_HEATMAP.map((asset) => {
          const totalFindings = asset.criticalCount + asset.highCount + asset.mediumCount + asset.lowCount;
          const isSelected = selectedAsset?.id === asset.id;

          return (
            <div
              key={asset.id}
              onClick={() => setSelectedAsset(asset)}
              className={`group flex flex-col justify-between rounded-xl border p-4 transition-all cursor-pointer ${
                isSelected
                  ? "border-slate-900 bg-slate-900 text-white shadow-md ring-2 ring-slate-900/10"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs"
              }`}
            >
              <div>
                {/* Header: Icon + Category + Risk Index */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`rounded-lg p-2 ${
                        isSelected ? "bg-slate-800" : "bg-slate-50"
                      }`}
                    >
                      {getCategoryIcon(asset.id)}
                    </div>
                    <div>
                      <h3
                        className={`text-xs font-bold ${
                          isSelected ? "text-white" : "text-slate-900"
                        }`}
                      >
                        {asset.category}
                      </h3>
                      <div
                        className={`text-[11px] font-mono ${
                          isSelected ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        {asset.assetCount} endpoints • {asset.coveragePct}% verified
                      </div>
                    </div>
                  </div>

                  {/* Risk Score Pill */}
                  <div
                    className={`rounded-md px-2 py-0.5 text-xs font-bold font-mono ${
                      asset.riskScore >= 90
                        ? isSelected
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : asset.riskScore >= 80
                        ? isSelected
                          ? "bg-blue-500/20 text-blue-300 border border-blue-400/30"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                        : isSelected
                        ? "bg-amber-500/20 text-amber-300 border border-amber-400/30"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {asset.riskScore}/100
                  </div>
                </div>

                {/* Stacked findings mini-bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className={isSelected ? "text-slate-300" : "text-slate-600"}>
                      Open Findings: <strong>{totalFindings}</strong>
                    </span>
                    <span
                      className={`font-mono text-[10px] ${
                        isSelected ? "text-slate-400" : "text-slate-400"
                      }`}
                    >
                      {asset.criticalCount} Crit • {asset.highCount} High
                    </span>
                  </div>

                  <div
                    className={`flex h-2 w-full overflow-hidden rounded-full ${
                      isSelected ? "bg-slate-800" : "bg-slate-100"
                    }`}
                  >
                    {totalFindings === 0 ? (
                      <div className="h-full w-full bg-emerald-500/40" />
                    ) : (
                      <>
                        {asset.criticalCount > 0 && (
                          <div
                            className="h-full bg-rose-500"
                            style={{
                              width: `${(asset.criticalCount / totalFindings) * 100}%`,
                            }}
                          />
                        )}
                        {asset.highCount > 0 && (
                          <div
                            className="h-full bg-amber-500"
                            style={{
                              width: `${(asset.highCount / totalFindings) * 100}%`,
                            }}
                          />
                        )}
                        {asset.mediumCount > 0 && (
                          <div
                            className="h-full bg-blue-500"
                            style={{
                              width: `${(asset.mediumCount / totalFindings) * 100}%`,
                            }}
                          />
                        )}
                        {asset.lowCount > 0 && (
                          <div
                            className="h-full bg-slate-400"
                            style={{
                              width: `${(asset.lowCount / totalFindings) * 100}%`,
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div
                className={`mt-4 flex items-center justify-between border-t pt-2.5 text-[11px] ${
                  isSelected ? "border-slate-800 text-slate-400" : "border-slate-100 text-slate-500"
                }`}
              >
                <span className="capitalize">{asset.trend} posture</span>
                <span className="flex items-center gap-1 group-hover:underline">
                  View Endpoints <ArrowUpRight className="size-3" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
