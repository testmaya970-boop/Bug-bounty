"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
  Layers, 
  ExternalLink, 
  ShieldCheck, 
  AlertOctagon, 
  Clock, 
  ArrowUpDown,
  Coins
} from "lucide-react";
import { PROGRAM_PERFORMANCES, ProgramPerformance } from "../../../lib/mock/executive-analytics";

interface ExecutiveProgramMatrixProps {
  organizationId: string;
}

export function ExecutiveProgramMatrix({ organizationId }: ExecutiveProgramMatrixProps) {
  const [sortBy, setSortBy] = useState<"health" | "open" | "critical" | "spend">("health");
  const [filterType, setFilterType] = useState<string>("all");

  const filteredPrograms = PROGRAM_PERFORMANCES.filter((prog) => {
    if (filterType === "all") return true;
    return prog.type.toLowerCase().includes(filterType.toLowerCase());
  }).sort((a, b) => {
    if (sortBy === "health") return b.healthScore - a.healthScore;
    if (sortBy === "open") return b.openFindings - a.openFindings;
    if (sortBy === "critical") return b.criticalFindings - a.criticalFindings;
    if (sortBy === "spend") return b.totalAwarded - a.totalAwarded;
    return 0;
  });

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Portfolio Scorecard
          </span>
          <h2 className="text-base font-bold text-slate-900">
            Program Performance & SLA Integrity
          </h2>
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            {["all", "Bug Bounty", "Private", "VDP"].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  filterType === type
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {type === "all" ? "All Types" : type}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
          >
            <option value="health">Sort: Health Score</option>
            <option value="critical">Sort: Critical Findings</option>
            <option value="open">Sort: Open Findings</option>
            <option value="spend">Sort: Total Awarded</option>
          </select>
        </div>
      </div>

      {/* Program Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200/70 bg-slate-50/60 text-slate-500 font-semibold">
              <th className="py-2.5 px-3">Program Name</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3 text-center">Health</th>
              <th className="py-2.5 px-3 text-right">Open (Crit)</th>
              <th className="py-2.5 px-3 text-right">MTTR</th>
              <th className="py-2.5 px-3 text-right">SLA</th>
              <th className="py-2.5 px-3 text-right">Researchers</th>
              <th className="py-2.5 px-3 text-right">Awarded</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredPrograms.map((prog) => (
              <tr key={prog.id} className="hover:bg-slate-50/80 transition-colors group">
                {/* Program Name */}
                <td className="py-3 px-3">
                  <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {prog.name}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    ID: {prog.id}
                  </div>
                </td>

                {/* Program Type */}
                <td className="py-3 px-3">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                      prog.type === "Bug Bounty"
                        ? "bg-blue-50 text-blue-700 border border-blue-200/50"
                        : prog.type === "Private"
                        ? "bg-purple-50 text-purple-700 border border-purple-200/50"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {prog.type}
                  </span>
                </td>

                {/* Health Score */}
                <td className="py-3 px-3 text-center">
                  <span
                    className={`inline-flex items-center gap-1 font-mono font-bold text-xs ${
                      prog.healthScore >= 95
                        ? "text-emerald-700"
                        : prog.healthScore >= 90
                        ? "text-blue-700"
                        : "text-amber-700"
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${
                        prog.healthScore >= 95
                          ? "bg-emerald-500"
                          : prog.healthScore >= 90
                          ? "bg-blue-500"
                          : "bg-amber-500"
                      }`}
                    />
                    {prog.healthScore}%
                  </span>
                </td>

                {/* Open Findings (Critical) */}
                <td className="py-3 px-3 text-right font-mono">
                  <span className="font-bold text-slate-900">{prog.openFindings}</span>
                  {prog.criticalFindings > 0 && (
                    <span className="ml-1 text-rose-600 font-bold">
                      ({prog.criticalFindings} crit)
                    </span>
                  )}
                </td>

                {/* MTTR */}
                <td className="py-3 px-3 text-right font-mono text-slate-700">
                  {prog.mttrDays}d
                </td>

                {/* SLA Compliance */}
                <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-700">
                  {prog.slaCompliance}%
                </td>

                {/* Active Researchers */}
                <td className="py-3 px-3 text-right font-mono text-slate-700">
                  {prog.activeResearchers}
                </td>

                {/* Total Awarded */}
                <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                  ${prog.totalAwarded.toLocaleString()}
                </td>

                {/* Actions */}
                <td className="py-3 px-3 text-right">
                  <Link
                    href={`/organizations/${organizationId}/programs/${prog.id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:underline"
                  >
                    <span>View</span>
                    <ExternalLink className="size-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
