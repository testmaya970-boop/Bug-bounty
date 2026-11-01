"use client";

import React, { useState } from "react";
import { 
  Clock, 
  ArrowRight, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingDown, 
  TrendingUp,
  Info
} from "lucide-react";
import { MTTR_STAGES, MttrStage } from "../../../lib/mock/executive-analytics";

export function ExecutiveMttrPipeline() {
  const [selectedStage, setSelectedStage] = useState<MttrStage>(MTTR_STAGES[3]); // Default to bottleneck

  const totalAvgHours = MTTR_STAGES.reduce((acc, curr) => acc + curr.avgHours, 0);
  const totalDays = (totalAvgHours / 24).toFixed(1);

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Velocity Diagnostics
            </span>
            <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200/50">
              Median Cycle: {totalDays} Days
            </span>
          </div>
          <h2 className="text-base font-bold text-slate-900">
            MTTR Pipeline & Operational Lifecycle
          </h2>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" />
            Within Target SLA
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-500" />
            Bottleneck Stage
          </span>
        </div>
      </div>

      {/* Interactive Horizontal Pipeline Funnel */}
      <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
        {MTTR_STAGES.map((stage, idx) => {
          const isSelected = selectedStage.id === stage.id;
          const isOver = stage.avgHours > stage.slaTargetHours * 0.75;

          return (
            <div
              key={stage.id}
              onClick={() => setSelectedStage(stage)}
              className={`group relative flex flex-col justify-between rounded-xl p-3.5 border transition-all cursor-pointer ${
                isSelected
                  ? "border-slate-900 bg-slate-900 text-white shadow-md ring-2 ring-slate-900/10"
                  : stage.isBottleneck
                  ? "border-amber-200 bg-amber-50/40 text-slate-900 hover:bg-amber-50 hover:border-amber-300"
                  : "border-slate-200 bg-slate-50/50 text-slate-900 hover:bg-slate-100/70 hover:border-slate-300"
              }`}
            >
              {/* Step indicator */}
              <div>
                <div className="flex items-center justify-between text-[11px]">
                  <span
                    className={`font-mono font-bold ${
                      isSelected ? "text-slate-400" : "text-slate-400"
                    }`}
                  >
                    0{idx + 1}
                  </span>
                  {stage.isBottleneck ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[10px] font-bold ${
                        isSelected
                          ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      <AlertTriangle className="size-2.5" />
                      Bottleneck
                    </span>
                  ) : (
                    <CheckCircle2
                      className={`size-3 ${
                        isSelected ? "text-emerald-400" : "text-emerald-600"
                      }`}
                    />
                  )}
                </div>

                <div className="mt-2">
                  <div
                    className={`text-xs font-bold leading-tight ${
                      isSelected ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {stage.name}
                  </div>
                  <div
                    className={`mt-1 font-mono text-base font-extrabold ${
                      isSelected ? "text-emerald-400" : "text-slate-900"
                    }`}
                  >
                    {stage.avgHours >= 24
                      ? `${(stage.avgHours / 24).toFixed(1)} days`
                      : `${stage.avgHours} hrs`}
                  </div>
                </div>
              </div>

              {/* Progress meter vs SLA Target */}
              <div className="mt-3 border-t border-slate-200/40 pt-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className={isSelected ? "text-slate-400" : "text-slate-500"}>
                    Target: {stage.slaTargetHours}h
                  </span>
                  <span
                    className={`font-semibold ${
                      stage.trend.includes("faster")
                        ? isSelected
                          ? "text-emerald-300"
                          : "text-emerald-700"
                        : isSelected
                        ? "text-amber-300"
                        : "text-amber-700"
                    }`}
                  >
                    {stage.trend}
                  </span>
                </div>

                {/* Micro bar */}
                <div
                  className={`mt-1 h-1.5 w-full rounded-full overflow-hidden ${
                    isSelected ? "bg-slate-800" : "bg-slate-200"
                  }`}
                >
                  <div
                    className={`h-full rounded-full ${
                      stage.isBottleneck
                        ? "bg-amber-500"
                        : isSelected
                        ? "bg-emerald-400"
                        : "bg-emerald-600"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        (stage.avgHours / stage.slaTargetHours) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Stage Detail Callout Banner */}
      {selectedStage && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">
                Stage Detail: {selectedStage.name}
              </span>
              <span className="text-slate-500 font-mono">
                ({selectedStage.volumeCount} active reports in stage)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Average Duration:</span>
              <strong className="font-mono text-slate-900">
                {selectedStage.avgHours} hours
              </strong>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">SLA Tolerance:</span>
              <strong className="font-mono text-slate-900">
                {selectedStage.slaTargetHours} hours
              </strong>
            </div>
          </div>
          <p className="mt-1.5 text-slate-600 leading-relaxed">
            {selectedStage.description}.{" "}
            {selectedStage.isBottleneck && (
              <span className="text-amber-800 font-semibold">
                Bottleneck insight: Multi-repo PR approval latency accounts for 68% of this delay. 
                Integrating automated security canary environments is advised.
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
