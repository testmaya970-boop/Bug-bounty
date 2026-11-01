"use client";

import React, { useState } from "react";
import { 
  ShieldCheck, 
  BarChart3, 
  Layers, 
  Globe, 
  Users, 
  Coins, 
  CheckCircle2,
  Calendar,
  Sparkles
} from "lucide-react";
import { ExecutiveHeroHeader } from "./executive-hero-header";
import { ExecutiveScoreRadial } from "./executive-score-radial";
import { ExecutiveKpiGrid } from "./executive-kpi-grid";
import { ExecutiveTrendsChart } from "./executive-trends-chart";
import { ExecutiveMttrPipeline } from "./executive-mttr-pipeline";
import { ExecutiveAssetHeatmap } from "./executive-asset-heatmap";
import { ExecutiveProgramMatrix } from "./executive-program-matrix";
import { ExecutiveResearcherIntelligence } from "./executive-researcher-intelligence";
import { ExecutiveFinancialDashboard } from "./executive-financial-dashboard";
import { ExecutiveSlaGauges } from "./executive-sla-gauges";
import { ExecutiveTimelineFeed } from "./executive-timeline-feed";
import { ExecutiveCopilotDrawer } from "./executive-copilot-drawer";
import { ExecutiveExportModal } from "./executive-export-modal";

interface ExecutiveAnalyticsHubProps {
  organizationId: string;
  organizationName: string;
  programs: Array<{ id: string; name: string }>;
}

export function ExecutiveAnalyticsHub({
  organizationId,
  organizationName,
  programs,
}: ExecutiveAnalyticsHubProps) {
  const [selectedRange, setSelectedRange] = useState<"7d" | "30d" | "90d" | "12m">("30d");
  const [selectedProgram, setSelectedProgram] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<
    "overview" | "vulnerabilities" | "surface" | "researchers" | "financials" | "compliance"
  >("overview");

  const [copilotOpen, setCopilotOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const tabs = [
    { id: "overview", label: "Executive Overview", icon: ShieldCheck },
    { id: "vulnerabilities", label: "Vulnerability Operations", icon: BarChart3 },
    { id: "surface", label: "Attack Surface Risk", icon: Globe },
    { id: "researchers", label: "Researcher Intelligence", icon: Users },
    { id: "financials", label: "Financials & Bounties", icon: Coins },
    { id: "compliance", label: "SLA & Audit Compliance", icon: CheckCircle2 },
  ] as const;

  return (
    <div className="space-y-6">
      {/* 1. Hero Header with Date Controls & Actions */}
      <ExecutiveHeroHeader
        organizationName={organizationName}
        selectedRange={selectedRange}
        onRangeChange={setSelectedRange}
        selectedProgram={selectedProgram}
        onProgramChange={setSelectedProgram}
        programs={programs}
        onOpenExport={() => setExportModalOpen(true)}
        onToggleCopilot={() => setCopilotOpen(!copilotOpen)}
        copilotOpen={copilotOpen}
      />

      {/* 2. Top-Level Tab Navigation */}
      <div className="flex border-b border-slate-200 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? "border-slate-900 text-slate-900 font-bold"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              <Icon className={`size-4 ${isActive ? "text-slate-900" : "text-slate-400"}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Section Content Rendering */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Top Row: Score Radial (1/3) + Global 10 KPIs (2/3) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <ExecutiveScoreRadial />
            </div>
            <div className="lg:col-span-8 flex flex-col justify-between">
              <ExecutiveKpiGrid
                onKpiClick={(kpiId) => {
                  if (kpiId.includes("finding") || kpiId.includes("mttr")) setActiveTab("vulnerabilities");
                  else if (kpiId.includes("asset") || kpiId.includes("coverage")) setActiveTab("surface");
                  else if (kpiId.includes("researcher")) setActiveTab("researchers");
                  else if (kpiId.includes("reward")) setActiveTab("financials");
                  else if (kpiId.includes("sla")) setActiveTab("compliance");
                }}
              />
            </div>
          </div>

          {/* Vulnerability Ingest vs Resolution Trends */}
          <ExecutiveTrendsChart range={selectedRange} />

          {/* MTTR Funnel Diagnostics */}
          <ExecutiveMttrPipeline />

          {/* Attack Surface Perimeter & Risk Density */}
          <ExecutiveAssetHeatmap />

          {/* Program Matrix & Scorecard */}
          <ExecutiveProgramMatrix organizationId={organizationId} />

          {/* Community Health & Signal */}
          <ExecutiveResearcherIntelligence />

          {/* Financial Operations & Budget Runway */}
          <ExecutiveFinancialDashboard />

          {/* Split Row: SLA Compliance & Executive Timeline */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ExecutiveSlaGauges />
            <ExecutiveTimelineFeed />
          </div>
        </div>
      )}

      {activeTab === "vulnerabilities" && (
        <div className="space-y-6">
          <ExecutiveTrendsChart range={selectedRange} />
          <ExecutiveMttrPipeline />
          <ExecutiveProgramMatrix organizationId={organizationId} />
        </div>
      )}

      {activeTab === "surface" && (
        <div className="space-y-6">
          <ExecutiveAssetHeatmap />
          <ExecutiveProgramMatrix organizationId={organizationId} />
        </div>
      )}

      {activeTab === "researchers" && (
        <div className="space-y-6">
          <ExecutiveResearcherIntelligence />
          <ExecutiveFinancialDashboard />
        </div>
      )}

      {activeTab === "financials" && (
        <div className="space-y-6">
          <ExecutiveFinancialDashboard />
          <ExecutiveProgramMatrix organizationId={organizationId} />
        </div>
      )}

      {activeTab === "compliance" && (
        <div className="space-y-6">
          <ExecutiveSlaGauges />
          <ExecutiveTimelineFeed />
        </div>
      )}

      {/* AI Copilot Drawer */}
      <ExecutiveCopilotDrawer
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
      />

      {/* Export & Compliance Modal */}
      <ExecutiveExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        organizationName={organizationName}
      />
    </div>
  );
}
