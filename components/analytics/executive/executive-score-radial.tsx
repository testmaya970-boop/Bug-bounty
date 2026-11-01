"use client";

import React from "react";
import { ArrowUpRight, ShieldCheck, CheckCircle2, TrendingUp, AlertCircle } from "lucide-react";
import { EXECUTIVE_HEALTH } from "../../../lib/mock/executive-analytics";

export function ExecutiveScoreRadial() {
  const { score, grade, deltaPct, percentile, factors } = EXECUTIVE_HEALTH;

  // Compute SVG circular arc
  const radius = 64;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Posture Assessment
          </span>
          <h2 className="text-base font-bold text-slate-900">Executive Health Score</h2>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200/60">
          <ArrowUpRight className="size-3 text-emerald-600" />
          +{deltaPct}% vs last month
        </span>
      </div>

      {/* Main Score Area */}
      <div className="flex flex-col items-center justify-center py-6 sm:flex-row sm:items-center sm:gap-8">
        {/* Circular Gauge */}
        <div className="relative flex size-40 shrink-0 items-center justify-center">
          <svg className="size-full -rotate-90 transform" viewBox="0 0 160 160">
            {/* Background ring */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-slate-100"
              fill="transparent"
            />
            {/* Value ring with gradient */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              stroke="url(#score-gradient)"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={progressOffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
              fill="transparent"
            />
            <defs>
              <linearGradient id="score-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
          </svg>

          {/* Center value */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900 font-mono">
              {score}
            </span>
            <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">
              {grade}
            </span>
            <span className="text-[10px] text-slate-400">out of 100</span>
          </div>
        </div>

        {/* Posture context */}
        <div className="mt-4 text-center sm:mt-0 sm:text-left space-y-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
            <ShieldCheck className="size-4 text-emerald-600" />
            <span>{percentile}</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
            Calculated from 5 automated security dimensions, including unresolved critical SLA limits, 
            MTTR velocity, and verified asset coverage.
          </p>
          <div className="pt-1 flex flex-wrap gap-2 justify-center sm:justify-start">
            <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
              Zero SLA Breaches
            </span>
            <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
              Continuous Ingest
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown Factors */}
      <div className="mt-2 space-y-2.5 border-t border-slate-100 pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Posture Weighting Factors
        </span>
        <div className="space-y-2">
          {factors.map((factor) => (
            <div key={factor.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                <span className="font-medium text-slate-700">{factor.name}</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-900 font-semibold">{factor.weight}%</span>
                <span className="size-2 rounded-full bg-emerald-500" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
