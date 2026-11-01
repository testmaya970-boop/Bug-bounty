"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { motion, AnimatePresence } from "motion/react";
import {
  Shield,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Copy,
  HeartHandshake,
  Inbox,
  Check,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  ArrowDown,
  Users,
  Activity,
  FileCheck2,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Lock,
  Calendar,
  Building2,
  X,
  RefreshCw,
  Plus,
  Layers,
  Award,
  Globe,
  MessageSquare,
} from "lucide-react";
import {
  HERO_PIPELINE_STEPS,
  DEFAULT_TRIAGE_STATUS,
  KPI_OVERVIEW_CARDS,
  INITIAL_LIVE_QUEUE_REPORTS,
  QUEUE_SEVERITY_DISTRIBUTION,
  TRIAGE_PIPELINE_STAGES,
  TODAY_ANALYST_PERFORMANCE,
  ANALYST_TEAM_PROFILES,
  SERVICE_PLANS,
  PLAN_COMPARISON_MATRIX,
  COVERAGE_COMPARISON,
  CUSTOMER_OUTCOMES,
  WORKFLOW_TIMELINE_STEPS,
  TRIAGE_FAQ_ITEMS,
  getServicePlanById,
  filterLiveQueueReports,
  computeEffectiveTriageStatus,
  type TriagePlanId,
  type TriageSeverity,
  type PipelineStageId,
  type LiveQueueReportItem,
} from "../../lib/managed-triage-soc";
import {
  requestManagedTriageAction,
  cancelManagedTriageAction,
} from "../../actions/managed-triage";
import type {
  Escalation,
  Performance,
  Plan,
  ServiceCharge,
  Subscription,
} from "../../services/managed-triage";

export interface ManagedTriageCenterProps {
  organizationId: string;
  organizationName: string;
  plans: Plan[];
  subscription: Subscription | null;
  performance: Performance | null;
  escalations: Escalation[];
  charges: ServiceCharge[];
}

const CARD_SURFACE =
  "rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)] transition-all duration-200 ease-out hover:border-[#D0D5DD] hover:shadow-[0_8px_20px_rgba(16,24,40,0.06)]";

const ELEVATED_SURFACE =
  "rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-6 shadow-[0_4px_12px_rgba(16,24,40,0.06),0_1px_3px_rgba(16,24,40,0.04)]";

const PRIMARY_ACTION_BTN =
  "inline-flex h-[44px] items-center justify-center gap-2 rounded-[12px] bg-[#111827] px-5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-[#1F2937] hover:shadow-[0_6px_16px_rgba(16,24,40,0.14)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] whitespace-nowrap shrink-0 cursor-pointer";

const SECONDARY_ACTION_BTN =
  "inline-flex h-[44px] items-center justify-center gap-2 rounded-[12px] border border-[#E7EAF0] bg-[#FFFFFF] px-5 text-[13px] font-semibold text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:bg-[#F8FAFC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] whitespace-nowrap shrink-0 cursor-pointer";

function KpiSparkline({
  values,
  tone,
}: {
  values: number[];
  tone: "healthy" | "warning" | "critical" | "info";
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 84;
  const height = 28;
  const points = values
    .map((val, idx) => {
      const x = (idx / Math.max(values.length - 1, 1)) * width;
      const y = height - ((val - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const strokeColor =
    tone === "healthy"
      ? "#12B76A"
      : tone === "warning"
        ? "#F59E0B"
        : tone === "critical"
          ? "#EF4444"
          : "#2563EB";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="overflow-visible shrink-0"
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function renderKpiIcon(
  iconName: "inbox" | "alert" | "copy" | "clock" | "shield" | "heart",
) {
  switch (iconName) {
    case "inbox":
      return <Inbox className="h-4 w-4 text-[#475467]" />;
    case "alert":
      return <AlertTriangle className="h-4 w-4 text-[#EF4444]" />;
    case "copy":
      return <Copy className="h-4 w-4 text-[#12B76A]" />;
    case "clock":
      return <Clock className="h-4 w-4 text-[#12B76A]" />;
    case "shield":
      return <ShieldCheck className="h-4 w-4 text-[#12B76A]" />;
    case "heart":
      return <HeartHandshake className="h-4 w-4 text-[#12B76A]" />;
  }
}

export function ManagedTriageCenter({
  organizationId,
  organizationName,
  subscription,
}: ManagedTriageCenterProps) {
  const initiallyEnabled =
    subscription?.status === "active" || subscription?.status === "requested";

  const [isEnabled, setIsEnabled] = useState<boolean>(initiallyEnabled);
  const [selectedPlanId, setSelectedPlanId] = useState<TriagePlanId>("business");
  const [activeHeroStepIndex, setActiveHeroStepIndex] = useState<number>(2);
  const [severityFilter, setSeverityFilter] = useState<TriageSeverity | "all">("all");
  const [selectedPipelineStage, setSelectedPipelineStage] = useState<PipelineStageId | "all">("all");
  const [queueReports, setQueueReports] = useState<LiveQueueReportItem[]>(
    INITIAL_LIVE_QUEUE_REPORTS,
  );
  const [selectedReportId, setSelectedReportId] = useState<string>(
    INITIAL_LIVE_QUEUE_REPORTS[0].id,
  );
  const [hoveredAnalystId, setHoveredAnalystId] = useState<string | null>("sarah");
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<number>(4);
  const [openFaqIds, setOpenFaqIds] = useState<string[]>([
    "who-decides-severity",
    "do-analysts-approve-payouts",
  ]);
  const [isSimulatingSkeleton, setIsSimulatingSkeleton] = useState<boolean>(false);

  // Modals
  const [enableModalOpen, setEnableModalOpen] = useState<boolean>(false);
  const [demoModalOpen, setDemoModalOpen] = useState<boolean>(false);
  const [demoSubmitted, setDemoSubmitted] = useState<boolean>(false);
  const [demoContactEmail, setDemoContactEmail] = useState<string>(
    "secops@northwind.cloud",
  );
  const [demoScopeNotes, setDemoScopeNotes] = useState<string>(
    "14 open reports across Core Cloud API & IAM scopes; priority SSRF/IDOR coverage.",
  );
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedPlan = getServicePlanById(selectedPlanId);
  const effectiveStatus = computeEffectiveTriageStatus(
    DEFAULT_TRIAGE_STATUS,
    isEnabled,
    selectedPlanId,
  );
  const filteredReports = filterLiveQueueReports(
    queueReports,
    severityFilter,
    selectedPipelineStage,
  );
  const activeReport =
    queueReports.find((r) => r.id === selectedReportId) ?? queueReports[0];

  const handleToggleFaq = (id: string) => {
    setOpenFaqIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSimulateIncomingReport = () => {
    setIsSimulatingSkeleton(true);
    setTimeout(() => {
      const nextNum = 9482 + queueReports.length;
      const newReport: LiveQueueReportItem = {
        id: `rep-${nextNum}`,
        reportCode: `UP-${nextNum}`,
        severity: "critical",
        vulnerabilityType: "RCE",
        title: "Deserialization gadget chain in async worker telemetry payload",
        targetAsset: "ingest.northwind.cloud",
        waitingLabel: "Just now (1m)",
        waitingMinutes: 1,
        statusText: "Assigned: Sarah",
        assignedAnalyst: "Sarah",
        cvssScore: "9.8",
        stageId: "validation",
      };
      setQueueReports((prev) => [newReport, ...prev]);
      setSelectedReportId(newReport.id);
      setIsSimulatingSkeleton(false);
      setActionBanner(
        `Simulated live report ${newReport.reportCode} (${newReport.vulnerabilityType}) routed to Sarah for immediate validation.`,
      );
    }, 180);
  };

  const handleConfirmEnableTriage = () => {
    startTransition(async () => {
      try {
        await requestManagedTriageAction(
          organizationId,
          selectedPlan.backendPlanCode,
          "USD",
        );
      } catch {
        // Fallback to local SOC state when running in preview mode
      }
      setIsEnabled(true);
      setEnableModalOpen(false);
      setActionBanner(
        `Managed Triage (${selectedPlan.name} — ${selectedPlan.monthlyPriceFormatted}) is now enabled. Your analyst pod is assigned and reviewing 14 waiting reports.`,
      );
    });
  };

  const handlePauseTriage = () => {
    startTransition(async () => {
      try {
        await cancelManagedTriageAction(organizationId);
      } catch {
        // Fallback to local SOC state
      }
      setIsEnabled(false);
      setActionBanner(
        "Managed Triage has been paused. All analyst notes and CVSS vectors remain in your audit log.",
      );
    });
  };

  return (
    <div className="min-h-screen bg-[#F6F8FB] text-[#111827]">
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 space-y-8">
        {/* 1. Breadcrumb & Top Operational Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E7EAF0] pb-4">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-[13px] font-medium text-[#475467]"
          >
            <Link
              prefetch={false}
              href={`/organizations/${organizationId}` as Route}
              className="hover:text-[#111827] transition-colors"
            >
              {organizationName}
            </Link>
            <span aria-hidden="true" className="text-[#98A2B3]">
              /
            </span>
            <span className="font-semibold text-[#111827]">Managed Triage</span>
          </nav>

          <div className="flex items-center gap-4 text-[12px] text-[#475467]">
            <span className="font-mono tabular-nums">
              SOC Desk: UTC 24/7 Watch
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#12B76A]">
              Audit Log Transparency: 100% Enforced
            </span>
          </div>
        </div>

        {/* Optional Action Confirmation Banner */}
        <AnimatePresence initial={false}>
          {actionBanner && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              role="status"
              className="flex items-center justify-between gap-4 rounded-[12px] border border-[#12B76A]/30 bg-[#FFFFFF] px-4 py-3 text-[13px] text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[#12B76A] shrink-0" />
                <span className="font-medium">{actionBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionBanner(null)}
                aria-label="Dismiss notification"
                className="text-[#667085] hover:text-[#111827] p-1 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main 2-Column Enterprise Layout: Left SOC Content + Right Sticky Action Panel */}
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_310px] items-start">
          <div className="space-y-8 min-w-0">
            {/* 2. Hero Overview */}
            <section
              aria-labelledby="managed-triage-hero-heading"
              className={ELEVATED_SURFACE}
            >
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-stretch">
                {/* Left Column */}
                <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[#2563EB]">
                      <Shield className="h-4 w-4" />
                      <span>Enterprise Vulnerability Operations</span>
                      <span aria-hidden="true" className="text-[#98A2B3]">
                        ·
                      </span>
                      <span className="text-[#475467] font-normal">
                        OSCP / OSWE / CISSP Certified Triage Cell
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h1
                        id="managed-triage-hero-heading"
                        className="text-[28px] sm:text-[34px] font-bold tracking-tight text-[#111827] leading-[1.15]"
                      >
                        Managed Triage
                      </h1>
                      <p className="text-[18px] font-semibold text-[#344054]">
                        Enterprise Vulnerability Operations
                      </p>
                    </div>

                    <p className="max-w-2xl text-[15px] leading-[1.65] text-[#475467]">
                      Let our security analysts validate, reproduce, prioritize,
                      deduplicate, score, and communicate with researchers
                      before reports reach your team. Everything remains fully
                      transparent and every action is recorded in your audit
                      log.
                    </p>

                    {/* Active SOC Operational Capabilities Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-3.5">
                        <p className="text-[12px] font-semibold text-[#111827]">
                          24/7/365 Watch Desk
                        </p>
                        <p className="mt-1 text-[12px] text-[#475467]">
                          Continuous global intake with &lt; 17m median first
                          analyst response.
                        </p>
                      </div>
                      <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-3.5">
                        <p className="text-[12px] font-semibold text-[#111827]">
                          Clean-Room PoC Replay
                        </p>
                        <p className="mt-1 text-[12px] text-[#475467]">
                          Every exploit is reproduced in isolated sandboxes
                          before escalation.
                        </p>
                      </div>
                      <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-3.5">
                        <p className="text-[12px] font-semibold text-[#111827]">
                          CVSS v3.1 &amp; CWE Clustering
                        </p>
                        <p className="mt-1 text-[12px] text-[#475467]">
                          Objective environmental scoring and 23% duplicate
                          suppression.
                        </p>
                      </div>
                      <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-3.5">
                        <p className="text-[12px] font-semibold text-[#111827]">
                          Researcher Communication
                        </p>
                        <p className="mt-1 text-[12px] text-[#475467]">
                          Analysts handle technical follow-ups and maintain 97%
                          researcher CSAT.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Operational Trust Guarantees */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#E7EAF0]">
                    <div>
                      <p className="text-[12px] text-[#667085]">
                        Payout Authority
                      </p>
                      <p className="mt-0.5 text-[13px] font-semibold text-[#111827]">
                        100% Organization Controlled
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] text-[#667085]">
                        Reproduction Environment
                      </p>
                      <p className="mt-0.5 text-[13px] font-semibold text-[#111827]">
                        Isolated Clean-Room PoC
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] text-[#667085]">
                        Audit Traceability
                      </p>
                      <p className="mt-0.5 text-[13px] font-semibold text-[#12B76A]">
                        Every Action Cryptographically Logged
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Column: Animated Security Operations Pipeline */}
                <div className="lg:col-span-5 rounded-[14px] border border-[#E7EAF0] bg-[#F6F8FB] p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E7EAF0]">
                    <span className="text-[12px] font-semibold text-[#111827]">
                      Security Operations Pipeline
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-[#475467]">
                      Median End-to-End: 38m
                    </span>
                  </div>

                  <div className="my-3 space-y-1.5" role="list">
                    {HERO_PIPELINE_STEPS.map((step, index) => {
                      const isSelected = activeHeroStepIndex === index;
                      const isLast = index === HERO_PIPELINE_STEPS.length - 1;
                      const indicatorColor =
                        step.status === "healthy"
                          ? "text-[#12B76A]"
                          : step.status === "decision"
                            ? "text-[#111827]"
                            : "text-[#2563EB]";

                      return (
                        <div key={step.id} role="listitem">
                          <button
                            type="button"
                            onClick={() => setActiveHeroStepIndex(index)}
                            className={`w-full text-left rounded-[10px] px-3 py-2 transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 ${
                              isSelected
                                ? "bg-[#FFFFFF] border border-[#D0D5DD] shadow-[0_2px_6px_rgba(16,24,40,0.06)]"
                                : "border border-transparent hover:bg-[#FFFFFF]/70"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`font-mono text-[11px] font-semibold tabular-nums ${indicatorColor}`}
                              >
                                0{index + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-[#111827] truncate">
                                  {step.label}
                                </p>
                                <p className="text-[11px] text-[#667085] truncate">
                                  {step.sublabel}
                                </p>
                              </div>
                            </div>
                            <span className="font-mono text-[11px] tabular-nums text-[#475467] shrink-0">
                              {step.avgDuration}
                            </span>
                          </button>

                          {!isLast && (
                            <div
                              aria-hidden="true"
                              className="flex items-center pl-5 py-0.5 text-[#98A2B3]"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-[#E7EAF0] flex items-center justify-between text-[11px] text-[#475467]">
                    <span>
                      Active Stage:{" "}
                      <strong className="text-[#111827]">
                        {HERO_PIPELINE_STEPS[activeHeroStepIndex]?.label}
                      </strong>
                    </span>
                    <span className="text-[#12B76A] font-medium">
                      Zero noise reaches engineering
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Organization Triage Status (Operational status before pricing) */}
            <section
              aria-labelledby="org-triage-status-heading"
              className={ELEVATED_SURFACE}
            >
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-[#E7EAF0]">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2
                      id="org-triage-status-heading"
                      className="text-[18px] font-bold text-[#111827]"
                    >
                      Organization Triage Status
                    </h2>
                    <span className="text-[#98A2B3]" aria-hidden="true">
                      ·
                    </span>
                    <span
                      data-testid="org-triage-current-status"
                      className={`text-[13px] font-semibold ${
                        effectiveStatus.enabled
                          ? "text-[#12B76A]"
                          : "text-[#F59E0B]"
                      }`}
                    >
                      Current Status: {effectiveStatus.statusLabel}
                    </span>
                  </div>
                  <p className="text-[13px] text-[#475467]">
                    Live operational backlog across {organizationName} security
                    programs and disclosure scopes.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {!effectiveStatus.enabled ? (
                    <button
                      type="button"
                      onClick={() => setEnableModalOpen(true)}
                      className={PRIMARY_ACTION_BTN}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Enable Managed Triage
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePauseTriage}
                      disabled={isPending}
                      className={SECONDARY_ACTION_BTN}
                    >
                      Pause Managed Triage
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDemoSubmitted(false);
                      setDemoModalOpen(true);
                    }}
                    className={SECONDARY_ACTION_BTN}
                  >
                    <Calendar className="h-4 w-4" />
                    Book Demo
                  </button>
                </div>
              </div>

              {/* 6 Operational Status Telemetry Cells */}
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-4">
                  <p className="text-[12px] text-[#667085]">Current Status</p>
                  <p
                    className={`mt-1.5 text-[16px] font-bold tabular-nums ${
                      effectiveStatus.enabled
                        ? "text-[#12B76A]"
                        : "text-[#F59E0B]"
                    }`}
                  >
                    {effectiveStatus.statusLabel}
                  </p>
                  <p className="mt-1 text-[11px] text-[#667085]">
                    {effectiveStatus.enabled
                      ? `${selectedPlan.name} Pod Active`
                      : "Internal self-triage"}
                  </p>
                </div>

                <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-4">
                  <p className="text-[12px] text-[#667085]">Reports Waiting</p>
                  <p className="mt-1.5 font-mono text-[22px] font-bold tabular-nums text-[#111827]">
                    {effectiveStatus.reportsWaiting}
                  </p>
                  <p className="mt-1 text-[11px] text-[#F59E0B]">
                    Unvalidated queue
                  </p>
                </div>

                <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-4">
                  <p className="text-[12px] text-[#667085]">Average Response</p>
                  <p
                    className={`mt-1.5 font-mono text-[22px] font-bold tabular-nums ${
                      effectiveStatus.enabled
                        ? "text-[#12B76A]"
                        : "text-[#F59E0B]"
                    }`}
                  >
                    {effectiveStatus.averageResponse}
                  </p>
                  <p className="mt-1 text-[11px] text-[#667085]">
                    {effectiveStatus.enabled
                      ? "Within 4h SOC target"
                      : "Target with SOC: 4h"}
                  </p>
                </div>

                <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-4">
                  <p className="text-[12px] text-[#667085]">Critical Waiting</p>
                  <p
                    className={`mt-1.5 font-mono text-[22px] font-bold tabular-nums ${
                      effectiveStatus.criticalWaiting > 0
                        ? "text-[#EF4444]"
                        : "text-[#12B76A]"
                    }`}
                  >
                    {effectiveStatus.criticalWaiting}
                  </p>
                  <p className="mt-1 text-[11px] text-[#EF4444]">
                    {effectiveStatus.criticalWaiting > 0
                      ? "Immediate PoC needed"
                      : "All P1s triaged"}
                  </p>
                </div>

                <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-4">
                  <p className="text-[12px] text-[#667085]">
                    Researcher Messages
                  </p>
                  <p className="mt-1.5 font-mono text-[22px] font-bold tabular-nums text-[#2563EB]">
                    {effectiveStatus.researcherMessages}
                  </p>
                  <p className="mt-1 text-[11px] text-[#667085]">
                    Awaiting status reply
                  </p>
                </div>

                <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-4">
                  <p className="text-[12px] text-[#667085]">
                    Estimated Engineer Hours Saved
                  </p>
                  <p className="mt-1.5 font-mono text-[22px] font-bold tabular-nums text-[#12B76A]">
                    {effectiveStatus.estimatedEngineerHoursSavedPerMonth}/month
                  </p>
                  <p className="mt-1 text-[11px] text-[#12B76A]">
                    Reclaimed AppSec capacity
                  </p>
                </div>
              </div>
            </section>

            {/* 4. KPI Overview (6 KPI Cards with small trend, small icon, mini sparkline) */}
            <section aria-labelledby="kpi-overview-heading" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2
                    id="kpi-overview-heading"
                    className="text-[18px] font-bold text-[#111827]"
                  >
                    KPI Overview
                  </h2>
                  <p className="text-[13px] text-[#475467]">
                    Real-time vulnerability triage telemetry across validation
                    velocity, deduplication, and scoring accuracy.
                  </p>
                </div>
                <span className="text-[12px] font-mono tabular-nums text-[#667085]">
                  Rolling 30-day SOC telemetry
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {KPI_OVERVIEW_CARDS.map((card) => {
                  const trendColor =
                    card.trendTone === "healthy"
                      ? "text-[#12B76A]"
                      : card.trendTone === "warning"
                        ? "text-[#F59E0B]"
                        : card.trendTone === "critical"
                          ? "text-[#EF4444]"
                          : "text-[#2563EB]";

                  return (
                    <motion.div
                      key={card.id}
                      whileHover={{ y: -2 }}
                      transition={{ duration: 0.15 }}
                      className={CARD_SURFACE}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-[#475467]">
                          {card.label}
                        </span>
                        {renderKpiIcon(card.iconName)}
                      </div>

                      <div className="mt-3 flex items-end justify-between gap-4">
                        <div>
                          <p className="font-mono text-[28px] font-bold tracking-tight tabular-nums text-[#111827] leading-none">
                            {card.value}
                          </p>
                          <p
                            className={`mt-2 text-[12px] font-medium ${trendColor}`}
                          >
                            {card.trend}
                          </p>
                        </div>
                        <KpiSparkline
                          values={card.sparkline}
                          tone={card.trendTone}
                        />
                      </div>

                      <p className="mt-3 pt-3 border-t border-[#E7EAF0] text-[12px] text-[#667085]">
                        {card.subtitle}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            {/* 5. Current / Live Queue */}
            <section
              aria-labelledby="live-queue-heading"
              className={CARD_SURFACE}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-[#E7EAF0]">
                <div>
                  <h2
                    id="live-queue-heading"
                    className="text-[18px] font-bold text-[#111827]"
                  >
                    Current Queue
                  </h2>
                  <p className="text-[13px] text-[#475467]">
                    Active vulnerability disclosures undergoing clean-room
                    reproduction, duplicate clustering, and CVSS verification.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSimulateIncomingReport}
                    className="inline-flex h-[36px] items-center gap-1.5 rounded-[10px] border border-[#E7EAF0] bg-[#FFFFFF] px-3 text-[12px] font-semibold text-[#111827] hover:bg-[#F8FAFC] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Simulate Incoming Report
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSimulatingSkeleton(true);
                      setTimeout(() => setIsSimulatingSkeleton(false), 350);
                    }}
                    className="inline-flex h-[36px] items-center gap-1.5 rounded-[10px] border border-[#E7EAF0] bg-[#FFFFFF] px-3 text-[12px] font-medium text-[#475467] hover:text-[#111827] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sync Telemetry
                  </button>
                </div>
              </div>

              {/* Severity Block Matrix Bar (Critical ■■■, High ■■■■■■, Medium ■■■■, Low ■■) */}
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {QUEUE_SEVERITY_DISTRIBUTION.map((tier) => {
                  const isSelected = severityFilter === tier.severity;
                  const blockColor =
                    tier.severity === "critical"
                      ? "bg-[#EF4444]"
                      : tier.severity === "high"
                        ? "bg-[#F59E0B]"
                        : tier.severity === "medium"
                          ? "bg-[#2563EB]"
                          : "bg-[#12B76A]";
                  const textColor =
                    tier.severity === "critical"
                      ? "text-[#EF4444]"
                      : tier.severity === "high"
                        ? "text-[#F59E0B]"
                        : tier.severity === "medium"
                          ? "text-[#2563EB]"
                          : "text-[#12B76A]";

                  return (
                    <button
                      key={tier.severity}
                      type="button"
                      onClick={() =>
                        setSeverityFilter((prev) =>
                          prev === tier.severity ? "all" : tier.severity,
                        )
                      }
                      className={`text-left rounded-[12px] border p-3.5 transition-all cursor-pointer ${
                        isSelected
                          ? "border-[#111827] bg-[#F6F8FB] shadow-xs"
                          : "border-[#E7EAF0] bg-[#FFFFFF] hover:border-[#D0D5DD]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[13px] font-bold ${textColor}`}>
                          {tier.label}
                        </span>
                        <span className="font-mono text-[13px] font-semibold tabular-nums text-[#111827]">
                          {tier.count} reports
                        </span>
                      </div>

                      <div
                        className="mt-2.5 flex items-center gap-1.5"
                        aria-label={`${tier.label}: ${tier.blocks} active queue blocks`}
                      >
                        {Array.from({ length: tier.blocks }).map((_, i) => (
                          <span
                            key={i}
                            className={`h-3 w-5 rounded-[3px] ${blockColor}`}
                          />
                        ))}
                      </div>

                      <p className="mt-2 text-[11px] text-[#667085]">
                        Target: {tier.slaTarget}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Interactive Severity Filter Segmented Control */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div
                  role="group"
                  aria-label="Filter queue by severity"
                  className="inline-flex flex-wrap items-center gap-1 rounded-[10px] bg-[#F6F8FB] p-1 border border-[#E7EAF0]"
                >
                  {(["all", "critical", "high", "medium", "low"] as const).map(
                    (sev) => (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => setSeverityFilter(sev)}
                        className={`px-3 py-1.5 text-[12px] font-semibold rounded-[8px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          severityFilter === sev
                            ? "bg-[#111827] text-white"
                            : "text-[#475467] hover:text-[#111827]"
                        }`}
                      >
                        {sev === "all"
                          ? "All Severities"
                          : sev.charAt(0).toUpperCase() + sev.slice(1)}
                      </button>
                    ),
                  )}
                </div>

                {selectedPipelineStage !== "all" && (
                  <button
                    type="button"
                    onClick={() => setSelectedPipelineStage("all")}
                    className="text-[12px] font-medium text-[#2563EB] hover:underline cursor-pointer"
                  >
                    Showing stage: {selectedPipelineStage.replace(/_/g, " ")} (Clear)
                  </button>
                )}
              </div>

              {/* Recent Reports List */}
              <div className="mt-4 divide-y divide-[#E7EAF0] rounded-[12px] border border-[#E7EAF0]">
                {isSimulatingSkeleton ? (
                  <div className="p-4 space-y-3" data-testid="queue-skeleton">
                    {[1, 2, 3].map((n) => (
                      <div
                        key={n}
                        className="h-12 rounded-[8px] bg-[#F6F8FB] animate-pulse"
                      />
                    ))}
                  </div>
                ) : filteredReports.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <p className="text-[14px] font-semibold text-[#111827]">
                      No queued reports match the current filter
                    </p>
                    <p className="text-[12px] text-[#667085]">
                      Reset the severity or pipeline stage filter to view active
                      SOC validations.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSeverityFilter("all");
                        setSelectedPipelineStage("all");
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#2563EB] hover:underline cursor-pointer"
                    >
                      Reset Queue Filters
                    </button>
                  </div>
                ) : (
                  filteredReports.map((report) => {
                    const sevColor =
                      report.severity === "critical"
                        ? "text-[#EF4444]"
                        : report.severity === "high"
                          ? "text-[#F59E0B]"
                          : report.severity === "medium"
                            ? "text-[#2563EB]"
                            : "text-[#12B76A]";
                    const isActive = activeReport?.id === report.id;

                    return (
                      <div
                        key={report.id}
                        className={`p-4 transition-colors ${
                          isActive ? "bg-[#F6F8FB]" : "bg-[#FFFFFF] hover:bg-[#F8FAFC]"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            {/* Clean unboxed metadata line with · separators */}
                            <div className="flex flex-wrap items-center gap-2 text-[12px]">
                              <span
                                className={`font-bold uppercase tracking-wide ${sevColor}`}
                              >
                                {report.severity.charAt(0).toUpperCase() +
                                  report.severity.slice(1)}
                              </span>
                              <span aria-hidden="true" className="text-[#98A2B3]">
                                ·
                              </span>
                              <span className="font-semibold text-[#111827]">
                                {report.vulnerabilityType}
                              </span>
                              <span aria-hidden="true" className="text-[#98A2B3]">
                                ·
                              </span>
                              <span className="font-mono tabular-nums text-[#475467]">
                                {report.waitingLabel}
                              </span>
                              <span aria-hidden="true" className="text-[#98A2B3]">
                                ·
                              </span>
                              <span className="font-medium text-[#12B76A]">
                                {report.statusText}
                              </span>
                            </div>

                            <p className="text-[14px] font-semibold text-[#111827] truncate">
                              <span className="font-mono text-[12px] text-[#667085] mr-2">
                                {report.reportCode}
                              </span>
                              {report.title}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-[12px] tabular-nums text-[#475467]">
                              CVSS {report.cvssScore} · {report.targetAsset}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedReportId(report.id)}
                              className="inline-flex h-[32px] items-center gap-1 rounded-[8px] border border-[#E7EAF0] bg-[#FFFFFF] px-2.5 text-[12px] font-semibold text-[#111827] hover:bg-[#F6F8FB] cursor-pointer whitespace-nowrap shrink-0"
                            >
                              {isActive ? "Inspecting" : "Inspect"}
                            </button>
                          </div>
                        </div>

                        {isActive && (
                          <div className="mt-3 pt-3 border-t border-[#E7EAF0] flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#475467]">
                            <div>
                              <span>
                                Sandbox Replay:{" "}
                                <strong className="text-[#111827]">
                                  Verified deterministic PoC
                                </strong>
                              </span>
                              <span className="mx-2 text-[#98A2B3]">·</span>
                              <span>
                                Audit Hash:{" "}
                                <code className="font-mono text-[#111827]">
                                  sha256:8f9c...{report.id.slice(-4)}
                                </code>
                              </span>
                            </div>
                            <span className="font-medium text-[#2563EB]">
                              Stage: {report.stageId.replace(/_/g, " ")}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* 6. Triage Pipeline (Horizontal Animated Pipeline) */}
            <section
              aria-labelledby="triage-pipeline-heading"
              className={CARD_SURFACE}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-5 border-b border-[#E7EAF0]">
                <div>
                  <h2
                    id="triage-pipeline-heading"
                    className="text-[18px] font-bold text-[#111827]"
                  >
                    Triage Pipeline
                  </h2>
                  <p className="text-[13px] text-[#475467]">
                    Click any pipeline stage to inspect SLA targets and filter the
                    live queue above.
                  </p>
                </div>
                <span className="font-mono text-[12px] tabular-nums text-[#12B76A] font-semibold">
                  28 Inbound → 4 Engineering-Ready (85.7% Noise Absorbed)
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                {TRIAGE_PIPELINE_STAGES.map((stage, index) => {
                  const isSelected = selectedPipelineStage === stage.id;
                  const isReady = stage.id === "ready_for_org";

                  return (
                    <motion.button
                      key={stage.id}
                      type="button"
                      whileHover={{ y: -2 }}
                      onClick={() =>
                        setSelectedPipelineStage((prev) =>
                          prev === stage.id ? "all" : stage.id,
                        )
                      }
                      className={`text-left rounded-[14px] border p-4 transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? "border-[#111827] bg-[#F6F8FB] shadow-xs"
                          : isReady
                            ? "border-[#12B76A]/40 bg-[#FFFFFF] hover:border-[#12B76A]"
                            : "border-[#E7EAF0] bg-[#FFFFFF] hover:border-[#D0D5DD]"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 text-[11px] font-mono text-[#667085]">
                          <span>STAGE 0{index + 1}</span>
                          {index < TRIAGE_PIPELINE_STAGES.length - 1 && (
                            <ArrowRight
                              className="h-3.5 w-3.5 text-[#98A2B3] hidden lg:inline"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <p className="mt-1.5 text-[13px] font-bold text-[#111827]">
                          {stage.label}
                        </p>
                      </div>

                      <div className="mt-4">
                        <p
                          className={`font-mono text-[26px] font-bold tabular-nums leading-none ${
                            isReady ? "text-[#12B76A]" : "text-[#111827]"
                          }`}
                        >
                          {stage.count}
                        </p>
                        <p className="mt-2 text-[11px] font-medium text-[#475467]">
                          SLA: {stage.slaTarget}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#667085]">
                          {stage.automationRate}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </section>

            {/* 7. Analyst Performance (Today's Activity) */}
            <section
              aria-labelledby="analyst-performance-heading"
              className={CARD_SURFACE}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-5 border-b border-[#E7EAF0]">
                <div>
                  <h2
                    id="analyst-performance-heading"
                    className="text-[18px] font-bold text-[#111827]"
                  >
                    Analyst Performance · Today&apos;s Activity
                  </h2>
                  <p className="text-[13px] text-[#475467]">
                    Live shift metrics recorded across your dedicated Unpatched
                    SOC analyst pod over the last 24 hours.
                  </p>
                </div>
                <span className="text-[12px] font-semibold text-[#12B76A]">
                  Shift SLA Status: Healthy (100% On-Time)
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {TODAY_ANALYST_PERFORMANCE.map((metric) => (
                  <div
                    key={metric.id}
                    className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-4 flex flex-col justify-between"
                  >
                    <p className="text-[12px] font-semibold text-[#475467]">
                      {metric.label}
                    </p>
                    <p className="mt-2 font-mono text-[26px] font-bold tabular-nums text-[#111827]">
                      {metric.value}
                    </p>
                    <div className="mt-2 pt-2 border-t border-[#E7EAF0] space-y-0.5">
                      <p
                        className={`text-[11px] font-semibold ${
                          metric.tone === "healthy"
                            ? "text-[#12B76A]"
                            : "text-[#2563EB]"
                        }`}
                      >
                        {metric.delta}
                      </p>
                      <p className="text-[11px] text-[#667085]">
                        {metric.benchmark}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 8. Meet Your Analysts (Analyst Team) */}
            <section
              aria-labelledby="analyst-team-heading"
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2
                    id="analyst-team-heading"
                    className="text-[18px] font-bold text-[#111827]"
                  >
                    Meet Your Analysts
                  </h2>
                  <p className="text-[13px] text-[#475467]">
                    Named veteran security researchers and offensive engineers—not
                    anonymous ticket routers. Hover or select any analyst to
                    inspect their recent validations, SLA, languages, and
                    specialties.
                  </p>
                </div>
                <span className="text-[12px] text-[#475467]">
                  Hover or click a card to inspect full analyst dossier
                </span>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {ANALYST_TEAM_PROFILES.map((analyst) => {
                  const isExpanded = hoveredAnalystId === analyst.id;

                  return (
                    <motion.div
                      key={analyst.id}
                      onMouseEnter={() => setHoveredAnalystId(analyst.id)}
                      onFocus={() => setHoveredAnalystId(analyst.id)}
                      onClick={() => setHoveredAnalystId(analyst.id)}
                      whileHover={{ y: -3 }}
                      transition={{ duration: 0.16 }}
                      className={`rounded-[16px] border bg-[#FFFFFF] p-6 transition-all cursor-pointer ${
                        isExpanded
                          ? "border-[#111827] shadow-[0_12px_24px_rgba(16,24,40,0.08)]"
                          : "border-[#E7EAF0] shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#111827] text-[15px] font-bold text-white shrink-0">
                            {analyst.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="text-[16px] font-bold text-[#111827]">
                              {analyst.name}
                            </h3>
                            <p className="text-[13px] font-medium text-[#475467]">
                              {analyst.role}
                            </p>
                          </div>
                        </div>

                        <span className="text-[11px] font-semibold text-[#12B76A]">
                          {analyst.availability}
                        </span>
                      </div>

                      {/* Clean unboxed credentials metadata with · separators */}
                      <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[12px] text-[#344054]">
                        <span className="font-semibold text-[#111827]">
                          {analyst.certifications.join(" · ")}
                        </span>
                        <span aria-hidden="true" className="text-[#98A2B3]">
                          ·
                        </span>
                        <span>{analyst.experience}</span>
                        <span aria-hidden="true" className="text-[#98A2B3]">
                          ·
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-[#12B76A]">
                          {analyst.reportsValidatedLabel}
                        </span>
                      </div>

                      {/* Hover / Expanded Dossier Details: Recent work, Average SLA, Languages, Specialties */}
                      <div className="mt-4 pt-4 border-t border-[#E7EAF0] space-y-3 text-[12px]">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[11px] text-[#667085]">
                              Average SLA
                            </p>
                            <p className="font-mono font-semibold text-[#111827] tabular-nums">
                              {analyst.averageSla}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-[#667085]">
                              Languages
                            </p>
                            <p className="font-medium text-[#111827]">
                              {analyst.languages.join(", ")}
                            </p>
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] text-[#667085]">
                            Specialties
                          </p>
                          <p className="mt-0.5 font-medium text-[#344054]">
                            {analyst.specialties.join(" · ")}
                          </p>
                        </div>

                        <div>
                          <p className="text-[11px] text-[#667085]">
                            Recent Work
                          </p>
                          <ul className="mt-1.5 space-y-2">
                            {analyst.recentWork.map((work) => (
                              <li
                                key={work.reportCode}
                                className="rounded-[8px] bg-[#F6F8FB] p-2.5 border border-[#E7EAF0]"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-mono font-semibold text-[#111827]">
                                    {work.reportCode}
                                  </span>
                                  <span className="text-[#667085]">
                                    {work.timeAgo}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-[12px] font-medium text-[#111827]">
                                  {work.finding}
                                </p>
                                <p className="mt-0.5 text-[11px] text-[#12B76A]">
                                  {work.outcome}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            {/* 9. Service Plans (3 Premium Cards + 11-Row Comparison Matrix) */}
            <section
              id="service-plans-section"
              aria-labelledby="service-plans-heading"
              className="space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2
                    id="service-plans-heading"
                    className="text-[18px] font-bold text-[#111827]"
                  >
                    Service Plans
                  </h2>
                  <p className="text-[13px] text-[#475467]">
                    Predictable flat monthly SOC retainers—zero per-report fees
                    and zero percentage cut of researcher bounties.
                  </p>
                </div>
                <span className="text-[12px] text-[#475467]">
                  Select a tier to update your Sticky Action Panel
                </span>
              </div>

              {/* Three Premium Cards: Business | Enterprise (Highlighted) | Enterprise+ */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 items-stretch">
                {SERVICE_PLANS.map((plan) => {
                  const isSelected = selectedPlanId === plan.id;
                  const isHighlighted = Boolean(plan.highlighted);

                  return (
                    <motion.div
                      key={plan.id}
                      whileHover={{ y: -3 }}
                      transition={{ duration: 0.16 }}
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`rounded-[16px] p-6 flex flex-col justify-between transition-all cursor-pointer ${
                        isHighlighted
                          ? "border-2 border-[#111827] bg-[#FFFFFF] shadow-[0_12px_28px_rgba(16,24,40,0.10)]"
                          : isSelected
                            ? "border-2 border-[#2563EB] bg-[#FFFFFF] shadow-[0_8px_20px_rgba(16,24,40,0.08)]"
                            : "border border-[#E7EAF0] bg-[#FFFFFF] shadow-[0_1px_3px_rgba(16,24,40,0.05)] hover:border-[#D0D5DD]"
                      }`}
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-[18px] font-bold text-[#111827]">
                            {plan.name}
                          </h3>
                          {plan.badgeText ? (
                            <span className="text-[11px] font-semibold text-[#2563EB]">
                              {plan.badgeText}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#667085]">
                              {plan.coverageHours}
                            </span>
                          )}
                        </div>

                        <div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-mono text-[30px] font-bold tabular-nums text-[#111827]">
                              ${plan.monthlyPriceUsd.toLocaleString("en-US")}
                            </span>
                            <span className="text-[13px] text-[#667085]">
                              / month
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] text-[#667085]">
                            {plan.annualDiscountNote}
                          </p>
                        </div>

                        <p className="text-[13px] leading-relaxed text-[#475467]">
                          {plan.tagline}
                        </p>

                        <div className="grid grid-cols-2 gap-2 rounded-[10px] bg-[#F6F8FB] p-3 border border-[#E7EAF0] text-[12px]">
                          <div>
                            <p className="text-[11px] text-[#667085]">
                              First Response
                            </p>
                            <p className="font-mono font-semibold text-[#111827]">
                              {plan.firstResponseSla}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-[#667085]">
                              Analyst Pod
                            </p>
                            <p className="font-semibold text-[#111827]">
                              {plan.dedicatedAnalysts}
                            </p>
                          </div>
                        </div>

                        <ul className="space-y-2.5 pt-2">
                          {plan.highlights.map((item) => (
                            <li
                              key={item}
                              className="flex items-start gap-2.5 text-[13px] text-[#344054]"
                            >
                              <Check className="h-4 w-4 text-[#12B76A] shrink-0 mt-0.5" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-6 pt-4 border-t border-[#E7EAF0]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPlanId(plan.id);
                            setEnableModalOpen(true);
                          }}
                          className={
                            isHighlighted || isSelected
                              ? `${PRIMARY_ACTION_BTN} w-full`
                              : `${SECONDARY_ACTION_BTN} w-full`
                          }
                        >
                          {isSelected
                            ? `Enable ${plan.name} Plan`
                            : `Select ${plan.name}`}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* 11-Row Feature Comparison Matrix */}
              <div className={CARD_SURFACE}>
                <div className="pb-4 border-b border-[#E7EAF0] flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[15px] font-bold text-[#111827]">
                    SOC Tier Capability & SLA Comparison
                  </h3>
                  <span className="text-[12px] text-[#667085]">
                    All plans include full audit log visibility & zero payout
                    override
                  </span>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#E7EAF0] text-[12px] font-semibold text-[#475467]">
                        <th className="py-3 pr-4">Capability</th>
                        <th className="py-3 px-4">Business ($2,500/mo)</th>
                        <th className="py-3 px-4 text-[#111827]">
                          Enterprise ($5,500/mo)
                        </th>
                        <th className="py-3 pl-4">Enterprise+ ($9,500/mo)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7EAF0] text-[13px]">
                      {PLAN_COMPARISON_MATRIX.map((row) => (
                        <tr
                          key={row.id}
                          className="hover:bg-[#F8FAFC] transition-colors"
                        >
                          <td className="py-3 pr-4 font-semibold text-[#111827]">
                            {row.feature}
                          </td>
                          <td className="py-3 px-4 text-[#475467]">
                            {row.business}
                          </td>
                          <td className="py-3 px-4 font-medium text-[#111827] bg-[#F6F8FB]/60">
                            {row.enterprise}
                          </td>
                          <td className="py-3 pl-4 text-[#344054]">
                            {row.enterprisePlus}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* 10. Coverage Comparison (Side-by-Side Visual Operational Comparison) */}
            <section
              aria-labelledby="coverage-comparison-heading"
              className="space-y-4"
            >
              <div>
                <h2
                  id="coverage-comparison-heading"
                  className="text-[18px] font-bold text-[#111827]"
                >
                  Coverage Comparison
                </h2>
                <p className="text-[13px] text-[#475467]">
                  Operational impact of routing inbound disclosures through
                  Unpatched SOC analysts before engineering handoff.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 items-stretch">
                {/* Without Managed Triage */}
                <div className={CARD_SURFACE}>
                  <div className="pb-4 border-b border-[#E7EAF0]">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[16px] font-bold text-[#111827]">
                        {COVERAGE_COMPARISON.withoutManaged.title}
                      </h3>
                      <span className="text-[12px] font-semibold text-[#EF4444]">
                        High Engineering Drag
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-[#667085]">
                      {COVERAGE_COMPARISON.withoutManaged.subtitle}
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {COVERAGE_COMPARISON.withoutManaged.metrics.map((m) => (
                      <div
                        key={m.label}
                        className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-bold text-[#111827]">
                            {m.label}
                          </span>
                          <span
                            className={`font-mono text-[12px] font-semibold tabular-nums ${
                              m.status === "critical"
                                ? "text-[#EF4444]"
                                : "text-[#F59E0B]"
                            }`}
                          >
                            {m.value}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-[#475467]">
                          {m.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* With Managed Triage */}
                <div className="rounded-[16px] border-2 border-[#111827] bg-[#FFFFFF] p-6 shadow-[0_8px_24px_rgba(16,24,40,0.08)]">
                  <div className="pb-4 border-b border-[#E7EAF0]">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[16px] font-bold text-[#111827]">
                        {COVERAGE_COMPARISON.withManaged.title}
                      </h3>
                      <span className="text-[12px] font-semibold text-[#12B76A]">
                        Verified SOC Operations
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-[#475467]">
                      {COVERAGE_COMPARISON.withManaged.subtitle}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {COVERAGE_COMPARISON.withManaged.metrics.map((m) => (
                      <div
                        key={m.label}
                        className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-bold text-[#111827]">
                            {m.label}
                          </span>
                          <span className="font-mono text-[11px] font-semibold tabular-nums text-[#12B76A]">
                            {m.value}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-[#475467]">
                          {m.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* 11. Customer Outcomes (Large Animated Counters) */}
            <section
              aria-labelledby="customer-outcomes-heading"
              className={CARD_SURFACE}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-5 border-b border-[#E7EAF0]">
                <div>
                  <h2
                    id="customer-outcomes-heading"
                    className="text-[18px] font-bold text-[#111827]"
                  >
                    Customer Outcomes
                  </h2>
                  <p className="text-[13px] text-[#475467]">
                    Measured operational benchmarks across enterprise security
                    teams running Unpatched Managed Triage.
                  </p>
                </div>
                <span className="text-[12px] font-mono tabular-nums text-[#667085]">
                  Verified Q1–Q4 Enterprise Cohort
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {CUSTOMER_OUTCOMES.map((outcome) => (
                  <div
                    key={outcome.id}
                    className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-4 flex flex-col justify-between"
                  >
                    <div>
                      <p className="text-[12px] font-semibold text-[#475467]">
                        {outcome.label}
                      </p>
                      <p className="mt-2 font-mono text-[32px] font-bold tracking-tight tabular-nums text-[#12B76A] leading-none">
                        {outcome.numericValue}
                        {outcome.suffix}
                      </p>
                      <p className="mt-2 text-[12px] text-[#475467] leading-snug">
                        {outcome.detail}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-[#E7EAF0] text-[11px] space-y-0.5">
                      <p className="text-[#667085]">
                        Before: {outcome.beforeBaseline}
                      </p>
                      <p className="font-semibold text-[#111827]">
                        With SOC: {outcome.afterManaged}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 12. Workflow Timeline (10-Step Animated Progress) */}
            <section
              aria-labelledby="workflow-timeline-heading"
              className={CARD_SURFACE}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-5 border-b border-[#E7EAF0]">
                <div>
                  <h2
                    id="workflow-timeline-heading"
                    className="text-[18px] font-bold text-[#111827]"
                  >
                    End-to-End Triage Workflow
                  </h2>
                  <p className="text-[13px] text-[#475467]">
                    Every step from researcher submission to reward payout is
                    timestamped and cryptographically signed in your audit log.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveWorkflowStep((prev) =>
                        prev >= WORKFLOW_TIMELINE_STEPS.length ? 1 : prev + 1,
                      )
                    }
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-[8px] border border-[#E7EAF0] bg-[#FFFFFF] px-3 text-[12px] font-semibold text-[#111827] hover:bg-[#F8FAFC] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Advance Step ({activeWorkflowStep}/
                    {WORKFLOW_TIMELINE_STEPS.length})
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {WORKFLOW_TIMELINE_STEPS.map((step) => {
                  const isCompleted = step.stepNumber <= activeWorkflowStep;
                  const isCurrent = step.stepNumber === activeWorkflowStep;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setActiveWorkflowStep(step.stepNumber)}
                      className={`text-left rounded-[12px] border p-3.5 transition-all cursor-pointer flex flex-col justify-between ${
                        isCurrent
                          ? "border-[#111827] bg-[#F6F8FB] shadow-xs"
                          : isCompleted
                            ? "border-[#12B76A]/40 bg-[#FFFFFF]"
                            : "border-[#E7EAF0] bg-[#FFFFFF] opacity-85 hover:opacity-100"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 text-[11px] font-mono tabular-nums">
                          <span
                            className={
                              isCompleted
                                ? "font-bold text-[#12B76A]"
                                : "text-[#667085]"
                            }
                          >
                            STEP {String(step.stepNumber).padStart(2, "0")}
                          </span>
                          <span className="text-[#475467]">
                            {step.slaWindow}
                          </span>
                        </div>

                        <p className="mt-1.5 text-[13px] font-bold text-[#111827]">
                          {step.title}
                        </p>
                        <p className="mt-1 text-[11px] text-[#475467] leading-snug">
                          {step.description}
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-[#E7EAF0] text-[10px] font-mono text-[#667085] truncate">
                        {step.auditArtifact}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 13. FAQ Accordion */}
            <section
              aria-labelledby="managed-triage-faq-heading"
              className={CARD_SURFACE}
            >
              <div className="pb-5 border-b border-[#E7EAF0]">
                <h2
                  id="managed-triage-faq-heading"
                  className="text-[18px] font-bold text-[#111827]"
                >
                  Frequently Asked Questions
                </h2>
                <p className="text-[13px] text-[#475467]">
                  Governance, severity authority, billing mechanics, and SLA
                  guarantees.
                </p>
              </div>

              <div className="mt-4 divide-y divide-[#E7EAF0]">
                {TRIAGE_FAQ_ITEMS.map((faq) => {
                  const isOpen = openFaqIds.includes(faq.id);
                  return (
                    <div key={faq.id} className="py-4">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => handleToggleFaq(faq.id)}
                        className="flex w-full items-center justify-between gap-4 text-left cursor-pointer"
                      >
                        <span className="text-[15px] font-semibold text-[#111827]">
                          {faq.question}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-[#475467] shrink-0 transition-transform duration-150 ${
                            isOpen ? "rotate-180 text-[#111827]" : ""
                          }`}
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="mt-2.5 space-y-2 pr-6"
                          >
                            <p className="text-[14px] leading-relaxed text-[#475467]">
                              {faq.answer}
                            </p>
                            <p className="text-[12px] font-medium text-[#12B76A]">
                              Governance Guarantee: {faq.auditGuarantee}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* 14. Sticky Action Panel (Always-visible right sidebar on desktop) */}
          <aside
            aria-label="Managed Triage Summary & Activation"
            className="xl:sticky xl:top-6 space-y-4"
          >
            <div className="rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-6 shadow-[0_8px_24px_rgba(16,24,40,0.08)] space-y-5">
              <div className="pb-4 border-b border-[#E7EAF0]">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[16px] font-bold text-[#111827] whitespace-nowrap">
                    Managed Triage
                  </h2>
                  <span
                    className={`text-[12px] font-semibold whitespace-nowrap shrink-0 ${
                      effectiveStatus.enabled
                        ? "text-[#12B76A]"
                        : "text-[#F59E0B]"
                    }`}
                  >
                    {effectiveStatus.statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-[#667085]">
                  Dedicated SOC extension for {organizationName}
                </p>
              </div>

              {/* Quick Plan Selector Pill Tabs */}
              <div className="space-y-2.5">
                <label className="block text-[11px] font-semibold text-[#667085]">
                  Selected Plan
                </label>
                <div
                  role="group"
                  aria-label="Select SOC Plan Tier"
                  className="grid grid-cols-3 gap-1 rounded-[10px] bg-[#F6F8FB] p-1 border border-[#E7EAF0]"
                >
                  {SERVICE_PLANS.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`py-1.5 px-1 text-[11px] font-semibold rounded-[7px] transition-colors cursor-pointer whitespace-nowrap text-center ${
                        selectedPlanId === plan.id
                          ? "bg-[#111827] text-white"
                          : "text-[#475467] hover:text-[#111827]"
                      }`}
                    >
                      {plan.name}
                    </button>
                  ))}
                </div>

                <div className="pt-2 flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold text-[#111827]">
                    {selectedPlan.name}
                  </span>
                  <span
                    data-testid="sticky-selected-plan-price"
                    className="font-mono text-[17px] font-bold tabular-nums text-[#111827] whitespace-nowrap"
                  >
                    {selectedPlan.monthlyPriceFormatted}
                  </span>
                </div>
                <p className="text-[11px] text-[#667085]">
                  First response {selectedPlan.firstResponseSla} ·{" "}
                  {selectedPlan.coverageHours}
                </p>
              </div>

              {/* Included Checklist */}
              <div className="pt-4 border-t border-[#E7EAF0] space-y-2.5">
                <p className="text-[12px] font-semibold text-[#111827]">
                  Included
                </p>
                <ul className="space-y-2 text-[13px] text-[#344054]">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#12B76A] shrink-0" />
                    <span>Validation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#12B76A] shrink-0" />
                    <span>Reproduction</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#12B76A] shrink-0" />
                    <span>CVSS</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#12B76A] shrink-0" />
                    <span>Duplicate Detection</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#12B76A] shrink-0" />
                    <span>Researcher Communication</span>
                  </li>
                </ul>
              </div>

              {/* Expected Time Saved */}
              <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-3.5">
                <p className="text-[11px] text-[#667085]">
                  Expected Time Saved
                </p>
                <p className="mt-1 font-mono text-[20px] font-bold tabular-nums text-[#12B76A]">
                  {selectedPlan.expectedHoursSaved} hrs/month
                </p>
                <p className="mt-0.5 text-[11px] text-[#475467]">
                  Clears {effectiveStatus.reportsWaiting} waiting reports in
                  &lt; 24h
                </p>
              </div>

              {/* Primary & Secondary CTAs */}
              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEnableModalOpen(true)}
                  className={`${PRIMARY_ACTION_BTN} w-full`}
                >
                  {effectiveStatus.enabled
                    ? `Update Plan (${selectedPlan.name})`
                    : "Enable Managed Triage"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDemoSubmitted(false);
                    setDemoModalOpen(true);
                  }}
                  className={`${SECONDARY_ACTION_BTN} w-full`}
                >
                  Contact Sales
                </button>
              </div>

              <p className="text-[11px] text-center text-[#667085]">
                No long-term lock-in · Full audit log visibility
              </p>
            </div>
          </aside>
        </div>
      </div>

      {/* Modal 1: Enable Managed Triage Confirmation Dialog */}
      <AnimatePresence initial={false}>
        {enableModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="enable-soc-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-lg rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-6 shadow-xl space-y-5"
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#E7EAF0] pb-4">
                <div>
                  <h3
                    id="enable-soc-modal-title"
                    className="text-[18px] font-bold text-[#111827]"
                  >
                    Activate Managed Triage SOC Pod
                  </h3>
                  <p className="mt-1 text-[13px] text-[#475467]">
                    Assign Sarah, David, and Emily to begin triaging{" "}
                    {organizationName}&apos;s 14 waiting reports.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableModalOpen(false)}
                  aria-label="Close activation modal"
                  className="text-[#667085] hover:text-[#111827] p-1 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F6F8FB] p-4 space-y-2 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#475467]">Selected Tier</span>
                  <span className="font-bold text-[#111827]">
                    {selectedPlan.name} ({selectedPlan.monthlyPriceFormatted})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#475467]">First Response SLA</span>
                  <span className="font-mono font-semibold text-[#12B76A]">
                    {selectedPlan.firstResponseSla}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#475467]">Backlog Intake</span>
                  <span className="font-medium text-[#111827]">
                    14 open reports (2 Critical prioritized first)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#475467]">Bounty Payout Authority</span>
                  <span className="font-medium text-[#111827]">
                    Retained 100% by {organizationName}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEnableModalOpen(false)}
                  className={SECONDARY_ACTION_BTN}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleConfirmEnableTriage}
                  className={PRIMARY_ACTION_BTN}
                >
                  {isPending
                    ? "Activating Pod..."
                    : `Confirm & Enable (${selectedPlan.monthlyPriceFormatted})`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 2: Book Demo / Contact Sales */}
      <AnimatePresence initial={false}>
        {demoModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-demo-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-lg rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-6 shadow-xl space-y-5"
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#E7EAF0] pb-4">
                <div>
                  <h3
                    id="book-demo-modal-title"
                    className="text-[18px] font-bold text-[#111827]"
                  >
                    Schedule a SOC Architecture Briefing
                  </h3>
                  <p className="mt-1 text-[13px] text-[#475467]">
                    Meet directly with Lead Analyst Sarah and our Enterprise
                    AppSec directors.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDemoModalOpen(false)}
                  aria-label="Close briefing modal"
                  className="text-[#667085] hover:text-[#111827] p-1 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {demoSubmitted ? (
                <div className="space-y-4 py-2">
                  <div className="rounded-[12px] border border-[#12B76A]/30 bg-[#F6F8FB] p-4 text-[13px] space-y-1">
                    <p className="font-bold text-[#12B76A]">
                      Briefing Request Confirmed
                    </p>
                    <p className="text-[#475467]">
                      We have dispatched a calendar invite and sandbox walk-through
                      agenda to <strong>{demoContactEmail}</strong>.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setDemoModalOpen(false)}
                      className={PRIMARY_ACTION_BTN}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!demoContactEmail.trim()) return;
                    setDemoSubmitted(true);
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label
                      htmlFor="demo-email-input"
                      className="block text-[12px] font-semibold text-[#344054] mb-1"
                    >
                      Work Email
                    </label>
                    <input
                      id="demo-email-input"
                      type="email"
                      required
                      suppressHydrationWarning
                      value={demoContactEmail}
                      onChange={(e) => setDemoContactEmail(e.target.value)}
                      className="w-full rounded-[10px] border border-[#D0D5DD] px-3.5 py-2 text-[13px] text-[#111827] focus:border-[#111827] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="demo-scope-notes"
                      className="block text-[12px] font-semibold text-[#344054] mb-1"
                    >
                      Program Scope & SLA Priorities
                    </label>
                    <textarea
                      id="demo-scope-notes"
                      rows={3}
                      value={demoScopeNotes}
                      onChange={(e) => setDemoScopeNotes(e.target.value)}
                      className="w-full rounded-[10px] border border-[#D0D5DD] px-3.5 py-2 text-[13px] text-[#111827] focus:border-[#111827] focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setDemoModalOpen(false)}
                      className={SECONDARY_ACTION_BTN}
                    >
                      Cancel
                    </button>
                    <button type="submit" className={PRIMARY_ACTION_BTN}>
                      Request SOC Briefing
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
