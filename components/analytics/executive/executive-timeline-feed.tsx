"use client";

import React from "react";
import { 
  CheckCircle2, 
  Coins, 
  ShieldCheck, 
  Layers, 
  AlertTriangle,
  Clock,
  ArrowUpRight
} from "lucide-react";
import { EXECUTIVE_TIMELINE, ExecutiveTimelineEvent } from "../../../lib/mock/executive-analytics";

function getEventIcon(category: ExecutiveTimelineEvent["category"]) {
  switch (category) {
    case "resolution":
      return <CheckCircle2 className="size-3.5 text-emerald-600" />;
    case "bounty":
      return <Coins className="size-3.5 text-amber-600" />;
    case "compliance":
      return <ShieldCheck className="size-3.5 text-blue-600" />;
    case "program":
      return <Layers className="size-3.5 text-indigo-600" />;
    case "incident":
      return <AlertTriangle className="size-3.5 text-rose-600" />;
    default:
      return <Clock className="size-3.5 text-slate-500" />;
  }
}

export function ExecutiveTimelineFeed() {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Audit Stream
          </span>
          <h2 className="text-base font-bold text-slate-900">
            Executive Security Operations Timeline
          </h2>
        </div>
        <span className="text-xs font-medium text-slate-400">
          Showing latest milestone events
        </span>
      </div>

      {/* Events Stream */}
      <div className="mt-6 space-y-4">
        {EXECUTIVE_TIMELINE.map((evt, idx) => (
          <div key={evt.id} className="relative flex items-start gap-3.5 group">
            {/* Timeline vertical connector line */}
            {idx !== EXECUTIVE_TIMELINE.length - 1 && (
              <div className="absolute left-4 top-8 -bottom-4 w-px bg-slate-200" />
            )}

            {/* Icon Circle */}
            <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-2xs group-hover:border-slate-400 transition-colors">
              {getEventIcon(evt.category)}
            </div>

            {/* Content Card */}
            <div className="flex-1 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3.5 hover:bg-white hover:shadow-2xs transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-900">
                    {evt.title}
                  </h3>
                  {evt.severity && (
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wide ${
                        evt.severity === "critical"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {evt.severity}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {evt.relativeTime}
                </span>
              </div>

              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                {evt.description}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
                <span>Program: <strong className="text-slate-600 font-medium">{evt.programName}</strong></span>
                <span>•</span>
                <span>Actor: <span className="text-slate-600">{evt.author}</span></span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
