"use client";

import React from "react";
import { ShieldCheck, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { SLA_COMPLIANCE_TIERS } from "../../../lib/mock/executive-analytics";

function SlaRing({ pct, color }: { pct: number; color: string }) {
  const radius = 24;
  const stroke = 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative size-14 shrink-0 flex items-center justify-center">
      <svg className="size-full -rotate-90 transform" viewBox="0 0 60 60">
        <circle
          cx="30"
          cy="30"
          r={radius}
          stroke="#f1f5f9"
          strokeWidth={stroke}
          fill="transparent"
        />
        <circle
          cx="30"
          cy="30"
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute font-mono text-[11px] font-bold text-slate-900">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

export function ExecutiveSlaGauges() {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Remediation Compliance
          </span>
          <h2 className="text-base font-bold text-slate-900">
            SLA Adherence by Severity Tier
          </h2>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200/50">
          98.2% Org Average
        </span>
      </div>

      {/* 4 SLA Cards */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SLA_COMPLIANCE_TIERS.map((tier) => {
          const color =
            tier.severity === "Critical"
              ? "#f43f5e"
              : tier.severity === "High"
              ? "#f59e0b"
              : tier.severity === "Medium"
              ? "#3b82f6"
              : "#64748b";

          return (
            <div
              key={tier.severity}
              className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-50/50 p-3.5"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs font-bold text-slate-900">
                    {tier.severity} SLA
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Window: <strong>{tier.slaWindow}</strong>
                </div>
                <div className="text-[10.5px] text-emerald-700 font-semibold">
                  Target: {tier.target}% (Passing)
                </div>
              </div>

              <SlaRing pct={tier.actual} color={color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
