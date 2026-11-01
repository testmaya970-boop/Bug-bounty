"use client";

import React, { useState } from "react";
import { 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff,
  Maximize2
} from "lucide-react";
import { 
  VULNERABILITY_TRENDS_30D, 
  VULNERABILITY_TRENDS_90D, 
  VULNERABILITY_TRENDS_12M,
  VulnerabilityTrendPoint 
} from "../../../lib/mock/executive-analytics";

interface ExecutiveTrendsChartProps {
  range: "7d" | "30d" | "90d" | "12m";
}

export function ExecutiveTrendsChart({ range }: ExecutiveTrendsChartProps) {
  const [activeSeries, setActiveSeries] = useState({
    critical: true,
    high: true,
    medium: true,
    low: true,
    resolved: true,
  });

  const [hoveredPoint, setHoveredPoint] = useState<VulnerabilityTrendPoint | null>(null);

  // Pick dataset based on range
  const data = 
    range === "12m" 
      ? VULNERABILITY_TRENDS_12M 
      : range === "90d" 
      ? VULNERABILITY_TRENDS_90D 
      : VULNERABILITY_TRENDS_30D;

  // Maximum value for SVG scaling
  const maxVal = Math.max(
    ...data.map((d) => {
      let sum = 0;
      if (activeSeries.critical) sum += d.critical;
      if (activeSeries.high) sum += d.high;
      if (activeSeries.medium) sum += d.medium;
      if (activeSeries.low) sum += d.low;
      return Math.max(sum, activeSeries.resolved ? d.resolved : 0);
    }),
    10
  );

  const chartHeight = 220;
  const chartWidth = 720;
  const barWidth = Math.min(36, Math.max(16, (chartWidth / data.length) * 0.45));

  const toggleSeries = (key: keyof typeof activeSeries) => {
    setActiveSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Calculate resolution efficiency for current range
  const totalReported = data.reduce((acc, curr) => acc + curr.critical + curr.high + curr.medium + curr.low, 0);
  const totalResolved = data.reduce((acc, curr) => acc + curr.resolved, 0);
  const resolutionEfficiency = totalReported > 0 ? Math.round((totalResolved / totalReported) * 100) : 100;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Vulnerability Operations
            </span>
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/50">
              {resolutionEfficiency}% Resolution Velocity
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Vulnerability Ingest vs Resolution Trends
          </h2>
        </div>

        {/* Series Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => toggleSeries("critical")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors ${
              activeSeries.critical
                ? "bg-rose-50 text-rose-700 border border-rose-200/60"
                : "bg-slate-50 text-slate-400 border border-slate-200"
            }`}
          >
            <span className="size-2 rounded-full bg-rose-500" />
            <span>Critical</span>
          </button>

          <button
            type="button"
            onClick={() => toggleSeries("high")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors ${
              activeSeries.high
                ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                : "bg-slate-50 text-slate-400 border border-slate-200"
            }`}
          >
            <span className="size-2 rounded-full bg-amber-500" />
            <span>High</span>
          </button>

          <button
            type="button"
            onClick={() => toggleSeries("medium")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors ${
              activeSeries.medium
                ? "bg-blue-50 text-blue-700 border border-blue-200/60"
                : "bg-slate-50 text-slate-400 border border-slate-200"
            }`}
          >
            <span className="size-2 rounded-full bg-blue-500" />
            <span>Medium</span>
          </button>

          <button
            type="button"
            onClick={() => toggleSeries("low")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors ${
              activeSeries.low
                ? "bg-slate-100 text-slate-700 border border-slate-300"
                : "bg-slate-50 text-slate-400 border border-slate-200"
            }`}
          >
            <span className="size-2 rounded-full bg-slate-400" />
            <span>Low</span>
          </button>

          <div className="mx-1 h-3 w-px bg-slate-200" />

          <button
            type="button"
            onClick={() => toggleSeries("resolved")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors ${
              activeSeries.resolved
                ? "bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold"
                : "bg-slate-50 text-slate-400 border border-slate-200"
            }`}
          >
            <span className="size-2 rounded-full bg-emerald-600" />
            <span>Remediated</span>
          </button>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative mt-6 w-full overflow-x-auto select-none">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-56 min-w-[580px] overflow-visible"
        >
          {/* Horizontal gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = chartHeight - pct * (chartHeight - 30) - 20;
            const labelVal = Math.round(pct * maxVal);
            return (
              <g key={pct}>
                <line
                  x1="30"
                  y1={y}
                  x2={chartWidth - 10}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x="24"
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {labelVal}
                </text>
              </g>
            );
          })}

          {/* Stacked Bars for Vulnerability Findings */}
          {data.map((point, idx) => {
            const stepX = (chartWidth - 50) / data.length;
            const xCenter = 45 + idx * stepX + stepX / 2;
            const barX = xCenter - barWidth / 2;

            // Stack heights
            let currentY = chartHeight - 20;

            const critHeight = activeSeries.critical ? (point.critical / maxVal) * (chartHeight - 30) : 0;
            const highHeight = activeSeries.high ? (point.high / maxVal) * (chartHeight - 30) : 0;
            const medHeight = activeSeries.medium ? (point.medium / maxVal) * (chartHeight - 30) : 0;
            const lowHeight = activeSeries.low ? (point.low / maxVal) * (chartHeight - 30) : 0;

            const isHovered = hoveredPoint?.date === point.date;

            return (
              <g
                key={point.date}
                className="cursor-pointer group"
                onMouseEnter={() => setHoveredPoint(point)}
                onMouseLeave={() => setHoveredPoint(null)}
              >
                {/* Hover background column indicator */}
                <rect
                  x={xCenter - stepX / 2 + 2}
                  y="10"
                  width={stepX - 4}
                  height={chartHeight - 30}
                  fill={isHovered ? "#f8fafc" : "transparent"}
                  rx="6"
                  className="transition-colors"
                />

                {/* Low bar segment */}
                {lowHeight > 0 && (
                  <rect
                    x={barX}
                    y={currentY - lowHeight}
                    width={barWidth}
                    height={lowHeight}
                    fill="#94a3b8"
                    rx={medHeight === 0 && highHeight === 0 && critHeight === 0 ? 3 : 0}
                  />
                )}
                {(() => { currentY -= lowHeight; return null; })()}

                {/* Medium bar segment */}
                {medHeight > 0 && (
                  <rect
                    x={barX}
                    y={currentY - medHeight}
                    width={barWidth}
                    height={medHeight}
                    fill="#3b82f6"
                    rx={highHeight === 0 && critHeight === 0 ? 3 : 0}
                  />
                )}
                {(() => { currentY -= medHeight; return null; })()}

                {/* High bar segment */}
                {highHeight > 0 && (
                  <rect
                    x={barX}
                    y={currentY - highHeight}
                    width={barWidth}
                    height={highHeight}
                    fill="#f59e0b"
                    rx={critHeight === 0 ? 3 : 0}
                  />
                )}
                {(() => { currentY -= highHeight; return null; })()}

                {/* Critical bar segment */}
                {critHeight > 0 && (
                  <rect
                    x={barX}
                    y={currentY - critHeight}
                    width={barWidth}
                    height={critHeight}
                    fill="#f43f5e"
                    rx={3}
                  />
                )}

                {/* Date Label on X Axis */}
                <text
                  x={xCenter}
                  y={chartHeight - 4}
                  textAnchor="middle"
                  className={`text-[10.5px] font-medium font-mono ${
                    isHovered ? "fill-slate-900 font-bold" : "fill-slate-500"
                  }`}
                >
                  {point.label}
                </text>
              </g>
            );
          })}

          {/* Resolved Trend Line Overlay */}
          {activeSeries.resolved && (
            <>
              {/* Path line */}
              <path
                d={data.reduce((acc, point, idx) => {
                  const stepX = (chartWidth - 50) / data.length;
                  const x = 45 + idx * stepX + stepX / 2;
                  const y = chartHeight - 20 - (point.resolved / maxVal) * (chartHeight - 30);
                  return `${acc} ${idx === 0 ? "M" : "L"} ${x} ${y}`;
                }, "")}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data points on the line */}
              {data.map((point, idx) => {
                const stepX = (chartWidth - 50) / data.length;
                const x = 45 + idx * stepX + stepX / 2;
                const y = chartHeight - 20 - (point.resolved / maxVal) * (chartHeight - 30);
                const isHovered = hoveredPoint?.date === point.date;

                return (
                  <circle
                    key={point.date}
                    cx={x}
                    cy={y}
                    r={isHovered ? 5 : 3.5}
                    fill="#ffffff"
                    stroke="#10b981"
                    strokeWidth={isHovered ? 3 : 2}
                    className="transition-all"
                  />
                );
              })}
            </>
          )}
        </svg>

        {/* Hover Tooltip Card */}
        {hoveredPoint && (
          <div className="absolute right-4 top-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-xs text-xs pointer-events-none transition-all">
            <div className="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between gap-4">
              <span>{hoveredPoint.label}</span>
              <span className="text-[10px] text-slate-500 font-normal">Active Snapshot</span>
            </div>
            <div className="mt-1.5 space-y-1 font-mono">
              <div className="flex items-center justify-between gap-4 text-rose-600">
                <span>Critical:</span>
                <span className="font-bold">{hoveredPoint.critical}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-amber-600">
                <span>High:</span>
                <span className="font-bold">{hoveredPoint.high}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-blue-600">
                <span>Medium:</span>
                <span className="font-bold">{hoveredPoint.medium}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-slate-600">
                <span>Low:</span>
                <span className="font-bold">{hoveredPoint.low}</span>
              </div>
              <div className="border-t border-slate-100 pt-1 flex items-center justify-between gap-4 text-emerald-600 font-bold">
                <span>Remediated:</span>
                <span>{hoveredPoint.resolved}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
        <div className="flex items-center gap-4">
          <span>
            Total Reported in Period:{" "}
            <strong className="text-slate-900 font-mono">{totalReported} findings</strong>
          </span>
          <span>•</span>
          <span>
            Total Remediated:{" "}
            <strong className="text-emerald-700 font-mono">{totalResolved} resolved</strong>
          </span>
        </div>
        <div className="text-[11px] text-slate-400">
          Source: Synchronized Jira & GitHub security issues
        </div>
      </div>
    </div>
  );
}
