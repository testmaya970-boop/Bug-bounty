"use client";

import React from "react";
import { 
  Sparkles, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  TrendingUp, 
  ShieldCheck,
  Zap
} from "lucide-react";
import { AI_SECURITY_INSIGHTS, AiSecurityInsight } from "../../../lib/mock/executive-analytics";

interface ExecutiveCopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExecutiveCopilotDrawer({ isOpen, onClose }: ExecutiveCopilotDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-all">
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-slate-900 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold">Executive Security Watchdog</h3>
            <p className="text-[11px] text-slate-400">Automated Posture Insights & Synthesis</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 text-xs text-indigo-900">
          <div className="flex items-center gap-1.5 font-bold mb-1">
            <Zap className="size-3.5 text-indigo-600" />
            <span>Continuous Posture Synthesis</span>
          </div>
          Continuous analysis across your active findings, researcher submissions, and remediated tickets generated 4 actionable recommendations.
        </div>

        {AI_SECURITY_INSIGHTS.map((insight) => (
          <div
            key={insight.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 transition-all space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  insight.impact === "high"
                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                    : insight.impact === "positive"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                {insight.category} • {insight.impact} priority
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {insight.confidence}% confidence
              </span>
            </div>

            <h4 className="text-xs font-bold text-slate-900">{insight.title}</h4>
            <p className="text-xs text-slate-600 leading-relaxed">{insight.summary}</p>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-[11px] space-y-1">
              <span className="font-semibold text-slate-900 block">Recommended Action:</span>
              <p className="text-slate-600 leading-normal">{insight.recommendation}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Drawer Footer */}
      <div className="border-t border-slate-100 p-4 bg-slate-50 text-xs flex items-center justify-between">
        <span className="text-slate-500 font-mono">Engine: Verified Security Analyzer</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
