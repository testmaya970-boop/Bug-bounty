"use client";

import React from "react";
import { 
  Calendar, 
  Download, 
  Sparkles, 
  Filter, 
  ChevronDown, 
  FileText, 
  FileSpreadsheet, 
  ShieldCheck,
  RefreshCw
} from "lucide-react";

interface ExecutiveHeroHeaderProps {
  organizationName: string;
  selectedRange: "7d" | "30d" | "90d" | "12m";
  onRangeChange: (range: "7d" | "30d" | "90d" | "12m") => void;
  selectedProgram: string;
  onProgramChange: (program: string) => void;
  programs: Array<{ id: string; name: string }>;
  onOpenExport: () => void;
  onToggleCopilot: () => void;
  copilotOpen: boolean;
}

export function ExecutiveHeroHeader({
  organizationName,
  selectedRange,
  onRangeChange,
  selectedProgram,
  onProgramChange,
  programs,
  onOpenExport,
  onToggleCopilot,
  copilotOpen,
}: ExecutiveHeroHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white via-white to-slate-50/50 p-6 shadow-sm">
      {/* Decorative subtle ambient grid overlay */}
      <div 
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(#1e293b 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        {/* Left: Headline & Context */}
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white tracking-wide uppercase">
              <ShieldCheck className="size-3.5 text-emerald-400" />
              Executive Intelligence
            </span>
            <span className="text-xs font-medium text-slate-500">
              {organizationName} Continuous Posture
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Telemetry
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Security Analytics & Posture
          </h1>

          <p className="text-sm leading-relaxed text-slate-600">
            Executive visibility across your bug bounty programs, attack surface perimeter, 
            triaged vulnerabilities, researcher community, and continuous compliance SLAs.
          </p>
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
          {/* Top row: Filters & Range */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Program Filter */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                <Filter className="size-3.5 text-slate-400" />
                <span>
                  {selectedProgram === "all"
                    ? "All Programs (12)"
                    : programs.find((p) => p.id === selectedProgram)?.name ?? "Selected Program"}
                </span>
                <ChevronDown className="size-3 text-slate-400" />
              </button>

              {dropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        onProgramChange("all");
                        setDropdownOpen(false);
                      }}
                      className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                        selectedProgram === "all"
                          ? "bg-slate-900 text-white font-semibold"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      All Programs (12)
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    {programs.slice(0, 6).map((prog) => (
                      <button
                        key={prog.id}
                        type="button"
                        onClick={() => {
                          onProgramChange(prog.id);
                          setDropdownOpen(false);
                        }}
                        className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors truncate ${
                          selectedProgram === prog.id
                            ? "bg-slate-900 text-white font-semibold"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {prog.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Time Window Tabs */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 text-xs">
              {(["7d", "30d", "90d", "12m"] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => onRangeChange(range)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                    selectedRange === range
                      ? "bg-white text-slate-900 shadow-xs font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {range === "7d" ? "7D" : range === "30d" ? "30D" : range === "90d" ? "90D" : "1 Year"}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom row: Primary Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleCopilot}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                copilotOpen
                  ? "bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/20"
                  : "border border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100"
              }`}
            >
              <Sparkles className="size-3.5 text-indigo-500" />
              <span>AI Insights</span>
              <span className="rounded-full bg-indigo-200 px-1.5 py-0.2 text-[10px] font-bold text-indigo-900">
                4
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenExport}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <Download className="size-3.5 text-slate-500" />
              <span>Export Executive Brief</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
