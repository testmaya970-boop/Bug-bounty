"use client";

import React from "react";
import { 
  Users, 
  Award, 
  Globe, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowUpRight,
  TrendingUp,
  Percent
} from "lucide-react";
import { 
  RESEARCHER_LEADERS, 
  GEO_DISTRIBUTION,
  ResearcherLeader 
} from "../../../lib/mock/executive-analytics";

export function ExecutiveResearcherIntelligence() {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Community Health & Signal
            </span>
            <span className="rounded bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 border border-violet-200/50">
              88% High-Fidelity Signal
            </span>
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Researcher Intelligence & Geographic Dispersion
          </h2>
        </div>

        <div className="text-xs text-slate-500 font-mono">
          <strong className="text-slate-900">184</strong> Active Contributors Across 24 Countries
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Leaderboard */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Top Security Researchers</span>
            <span>Reputation & Quality Signal</span>
          </div>

          <div className="space-y-2">
            {RESEARCHER_LEADERS.map((researcher) => (
              <div
                key={researcher.handle}
                className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-50/50 p-3 hover:bg-slate-100/70 hover:border-slate-300 transition-colors"
              >
                {/* Researcher profile */}
                <div className="flex items-center gap-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-900 font-mono font-bold text-xs text-white">
                    {researcher.rank}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">
                        {researcher.name}
                      </span>
                      <span className="font-mono text-[11px] text-blue-600">
                        {researcher.handle}
                      </span>
                      <span className="rounded bg-slate-200/80 px-1.5 py-0.2 text-[10px] font-semibold text-slate-700">
                        {researcher.country}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {researcher.totalFindings} confirmed reports • ${researcher.totalEarned.toLocaleString()} earned
                    </div>
                  </div>
                </div>

                {/* Performance stats */}
                <div className="flex items-center gap-4 text-right font-mono">
                  <div>
                    <div className="text-xs font-bold text-emerald-700">
                      {researcher.signalScore}%
                    </div>
                    <div className="text-[10px] text-slate-400">Signal Rating</div>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {researcher.acceptanceRate}%
                    </div>
                    <div className="text-[10px] text-slate-400">Acceptance</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right 1 Col: Geographic dispersion & Signal Ratio */}
        <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-900 mb-3">
              <span className="flex items-center gap-1.5">
                <Globe className="size-3.5 text-slate-600" />
                Geographic Dispersion
              </span>
              <span className="text-[11px] text-slate-500 font-normal">Active contributors</span>
            </div>

            <div className="space-y-2">
              {GEO_DISTRIBUTION.slice(0, 5).map((geo) => (
                <div key={geo.code} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-700 font-medium">{geo.country}</span>
                    <span className="font-mono text-slate-900 font-semibold">{geo.pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full"
                      style={{ width: `${geo.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Signal Quality Card */}
          <div className="border-t border-slate-200 pt-4">
            <span className="text-xs font-semibold text-slate-900 block mb-2">
              Signal Quality & Noise Reduction
            </span>
            <div className="rounded-lg bg-white p-3 border border-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Valid Actionable Reports</span>
                <span className="font-mono font-bold text-emerald-700">88.4%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Duplicates & Out of Scope</span>
                <span className="font-mono font-bold text-slate-500">11.6%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 flex overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: "88.4%" }} />
                <div className="h-full bg-slate-300" style={{ width: "11.6%" }} />
              </div>
              <p className="text-[10px] text-slate-500 leading-tight pt-1">
                Policy clarity and automated scope testing reduced duplicate noise by 24% this quarter.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
