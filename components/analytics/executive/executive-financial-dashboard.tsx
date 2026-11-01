"use client";

import React from "react";
import { 
  Coins, 
  CreditCard, 
  TrendingUp, 
  ArrowUpRight, 
  Calendar,
  AlertCircle,
  Clock
} from "lucide-react";
import { FINANCIAL_METRICS } from "../../../lib/mock/executive-analytics";

export function ExecutiveFinancialDashboard() {
  const {
    totalPaidYTD,
    totalBudgetAnnual,
    budgetRemaining,
    pendingApproval,
    monthlyBurnAvg,
    projectedNextMonth,
    runwayMonths,
    severityAverages,
  } = FINANCIAL_METRICS;

  const spendPct = Math.round((totalPaidYTD / totalBudgetAnnual) * 100);

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Financial Operations
            </span>
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/50">
              {runwayMonths} Months Budget Runway
            </span>
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Reward Capital & Budget Allocation
          </h2>
        </div>

        <div className="text-xs text-slate-500 font-mono">
          Annual Bounty Pool: <strong className="text-slate-900">${totalBudgetAnnual.toLocaleString()}</strong>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Overall Budget Runway & Burn */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Annual Reward Pool Consumption
            </span>
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-2xl font-bold text-slate-900">
                ${totalPaidYTD.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {spendPct}% of ${totalBudgetAnnual.toLocaleString()}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden mt-2">
              <div
                className="h-full bg-emerald-600 rounded-full"
                style={{ width: `${spendPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-slate-200 font-mono">
            <div>
              <span className="text-slate-500 text-[11px] block">Remaining Budget:</span>
              <strong className="text-slate-900 text-sm">
                ${budgetRemaining.toLocaleString()}
              </strong>
            </div>

            <div>
              <span className="text-slate-500 text-[11px] block">Pending Approval:</span>
              <strong className="text-amber-700 text-sm">
                ${pendingApproval.toLocaleString()}
              </strong>
            </div>

            <div>
              <span className="text-slate-500 text-[11px] block">Avg Monthly Burn:</span>
              <strong className="text-slate-900 text-sm">
                ${monthlyBurnAvg.toLocaleString()}
              </strong>
            </div>

            <div>
              <span className="text-slate-500 text-[11px] block">Next Month Forecast:</span>
              <strong className="text-blue-700 text-sm">
                ${projectedNextMonth.toLocaleString()}
              </strong>
            </div>
          </div>
        </div>

        {/* Right 2 cols: Severity Payout Distribution */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Bounty Distribution by Severity</span>
            <span>Average Payout & Volume</span>
          </div>

          <div className="space-y-2.5">
            {severityAverages.map((sev) => {
              const maxSevTotal = Math.max(...severityAverages.map((s) => s.total));
              const barPct = Math.round((sev.total / maxSevTotal) * 100);

              return (
                <div
                  key={sev.severity}
                  className="rounded-xl border border-slate-200/70 bg-white p-3 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-2.5 rounded-full ${
                          sev.severity === "Critical"
                            ? "bg-rose-500"
                            : sev.severity === "High"
                            ? "bg-amber-500"
                            : sev.severity === "Medium"
                            ? "bg-blue-500"
                            : "bg-slate-400"
                        }`}
                      />
                      <span className="font-bold text-slate-900">{sev.severity}</span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        ({sev.paidCount} bounties awarded)
                      </span>
                    </div>

                    <div className="flex items-center gap-3 font-mono">
                      <span className="text-slate-500 text-[11px]">
                        Avg: <strong className="text-slate-900">${sev.avgAmount}</strong>
                      </span>
                      <span className="text-slate-900 font-bold text-xs">
                        ${sev.total.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Horizontal Volume Bar */}
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        sev.severity === "Critical"
                          ? "bg-rose-500"
                          : sev.severity === "High"
                          ? "bg-amber-500"
                          : sev.severity === "Medium"
                          ? "bg-blue-500"
                          : "bg-slate-400"
                      }`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
