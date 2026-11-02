"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/form";
import { SeverityBadge, StatusBadge } from "../ui/badge";
import { REPORT_SEVERITIES, REPORT_STATUS_LABELS, type OrganizationReportSummary, type ReportSeverity, type ReportStatus } from "../../types/report";
import type { AssignableStaff } from "../../services/reports";
import { Pagination } from "../ui/pagination";
import { LocalTime } from "../ui/local-time";
import { computeFindingsOverviewMetrics, getFindingTechnicalFacts } from "../../lib/findings-metrics";
import {
  ShieldAlert,
  Flame,
  Clock,
  CheckCircle2,
  Search,
  ArrowUpRight,
  Terminal,
  X,
  ShieldCheck,
  Layers,
  Activity,
} from "lucide-react";

const STATUS_OPTIONS: { value: ReportStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "new", label: REPORT_STATUS_LABELS.new },
  { value: "triaging", label: REPORT_STATUS_LABELS.triaging },
  { value: "needs_information", label: REPORT_STATUS_LABELS.needs_information },
  { value: "accepted", label: REPORT_STATUS_LABELS.accepted },
  { value: "resolved", label: REPORT_STATUS_LABELS.resolved },
  { value: "informative", label: REPORT_STATUS_LABELS.informative },
  { value: "duplicate", label: REPORT_STATUS_LABELS.duplicate },
  { value: "not_applicable", label: REPORT_STATUS_LABELS.not_applicable },
  { value: "rejected", label: REPORT_STATUS_LABELS.rejected },
];

export function OrganizationFindingsTable({
  organizationId,
  reports,
  total,
  page,
  pageSize,
  programs,
  staff,
  currentUserId,
  slaComplianceRate,
  medianTriageHours,
}: {
  organizationId: string;
  reports: OrganizationReportSummary[];
  total: number;
  page: number;
  pageSize: number;
  programs: { id: string; name: string }[];
  staff: AssignableStaff[];
  currentUserId: string;
  slaComplianceRate: number | null;
  medianTriageHours: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const statusFilter = (searchParams.get("status") as ReportStatus | null) ?? "all";
  const severityFilter = (searchParams.get("severity") as ReportSeverity | "unconfirmed" | null) ?? "all";
  const programFilter = searchParams.get("program") ?? "all";
  const assigneeFilter = searchParams.get("assignee") ?? "all";
  const sortOrder = searchParams.get("sort") === "oldest" ? "oldest" : "newest";
  const committedQuery = searchParams.get("q") ?? "";

  const [queryInput, setQueryInput] = useState(committedQuery);
  const [prevCommittedQuery, setPrevCommittedQuery] = useState(committedQuery);
  if (committedQuery !== prevCommittedQuery) {
    setPrevCommittedQuery(committedQuery);
    setQueryInput(committedQuery);
  }

  // Selected report for the Quick-Inspect Technical Drawer
  const [inspectedReportId, setInspectedReportId] = useState<string | null>(null);

  const inspectedReport = reports.find((r) => r.id === inspectedReportId) ?? null;
  const inspectedEnrichment = inspectedReport ? getFindingTechnicalFacts(inspectedReport) : null;

  const metrics = computeFindingsOverviewMetrics(reports, { slaComplianceRate, medianTriageHours });

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === "all" || (key === "sort" && value === "newest")) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    next.delete("page");
    const qs = next.toString();
    startTransition(() => {
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
    });
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateParams({ q: queryInput.trim() || null });
  }

  function clearFilters() {
    setQueryInput("");
    startTransition(() => {
      router.replace(pathname as Route, { scroll: false });
    });
  }


  const hasActiveFilters =
    statusFilter !== "all" ||
    severityFilter !== "all" ||
    programFilter !== "all" ||
    assigneeFilter !== "all" ||
    committedQuery.length > 0;

  const totalCountForBar = Math.max(1, reports.length);
  const critPct = Math.round((metrics.criticalCount / totalCountForBar) * 100);
  const highPct = Math.round((metrics.highCount / totalCountForBar) * 100);
  const medPct = Math.round((metrics.mediumCount / totalCountForBar) * 100);
  const lowPct = Math.max(0, 100 - critPct - highPct - medPct);

  return (
    <div className="space-y-6">
      {/* 1. EXECUTIVE KPI ROW (6 CARDS) */}
      <section aria-label="Findings operational metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {/* KPI 1: Total Findings */}
        <div className="group rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-250 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(16,24,40,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wider text-[#667085]">Total Findings</span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
              <Layers className="size-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className=" font-mono text-[28px] font-bold tracking-tight text-[#111827] tabular-nums">{total}</span>
          </div>
          <p className="mt-1 text-[12px] text-[#667085]">Across {programs.length} active engagements</p>
        </div>

        {/* KPI 2: Open Triage Queue */}
        <div className="group rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-250 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(16,24,40,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wider text-[#667085]">Open Queue</span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
              <Activity className="size-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-[28px] font-bold tracking-tight text-[#111827] tabular-nums">{metrics.openFindings}</span>
            <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#2563EB]">
              {metrics.newCount} new · {metrics.triagingCount} triage
            </span>
          </div>
          <p className="mt-1 text-[12px] text-[#667085]">{metrics.acceptedCount} validated awaiting patch</p>
        </div>

        {/* KPI 3: Critical Unresolved (Elevated attention card) */}
        <div className="group relative overflow-hidden rounded-[16px] border border-[#FECACA] bg-white p-4 shadow-[0_4px_12px_rgba(239,68,68,0.08)] transition-all duration-250 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(239,68,68,0.14)]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[#B91C1C]">Critical Open</span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[#FEF3F2] text-[#EF4444]">
              <Flame className="size-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-[28px] font-bold tracking-tight text-[#111827] tabular-nums">{metrics.criticalOpenCount}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3F2] px-2 py-0.5 text-[11px] font-semibold text-[#EF4444]">
              <span className="size-1.5 rounded-full bg-[#EF4444] animate-pulse" />
              P1 Priority
            </span>
          </div>
          <p className="mt-1 text-[12px] font-medium text-[#B91C1C]">Requires immediate triage</p>
        </div>

        {/* KPI 4: High Severity Open */}
        <div className="group rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-250 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(16,24,40,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wider text-[#667085]">High Severity Open</span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[#FFFAEB] text-[#F59E0B]">
              <ShieldAlert className="size-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-[28px] font-bold tracking-tight text-[#111827] tabular-nums">{metrics.highOpenCount}</span>
            <span className="rounded-full bg-[#FFFAEB] px-2 py-0.5 text-[11px] font-semibold text-[#D97706]">
              {metrics.highCount} total high
            </span>
          </div>
          <p className="mt-1 text-[12px] text-[#667085]">Open high-severity reports</p>
        </div>

        {/* KPI 5: SLA Compliance */}
        <div className="group rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-250 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(16,24,40,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wider text-[#667085]">SLA Compliance</span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[#ECFDF3] text-[#12B76A]">
              <ShieldCheck className="size-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-[28px] font-bold tracking-tight text-[#111827] tabular-nums">{metrics.slaComplianceRate === null ? "-" : `${metrics.slaComplianceRate}%`}</span>
            {metrics.slaComplianceRate !== null && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${metrics.slaComplianceRate >= 90 ? "bg-[#ECFDF3] text-[#12B76A]" : "bg-[#FEF3F2] text-[#B91C1C]"}`}>{metrics.slaComplianceRate >= 90 ? "On track" : "Below target"}</span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-[#667085]">First responses within the program SLA</p>
        </div>

        {/* KPI 6: Median Time to Triage */}
        <div className="group rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-250 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(16,24,40,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wider text-[#667085]">Median MTTA</span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
              <Clock className="size-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-[28px] font-bold tracking-tight text-[#111827] tabular-nums">{metrics.medianTriageHours === null ? "-" : `${Math.round(metrics.medianTriageHours * 10) / 10}h`}</span>
          </div>
          <p className="mt-1 text-[12px] text-[#667085]">From submission to first triage</p>
        </div>
      </section>

      {/* 2. SEVERITY SPECTRUM & WORKFLOW PIPELINE BAR */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Severity Distribution Card */}
        <div className="rounded-[16px] border border-[#E7EAF0] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:col-span-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-[#111827]">Severity Distribution</h2>
              <p className="text-[12px] text-[#667085]">Click any severity band to filter the triage queue</p>
            </div>
            <span className="font-mono text-[12px] font-medium text-[#667085] tabular-nums">{reports.length} shown</span>
          </div>

          {/* Stacked Progress Bar */}
          <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-[#F2F4F7]">
            {critPct > 0 && (
              <div style={{ width: `${critPct}%` }} className="bg-[#EF4444] transition-all duration-300" title={`Critical: ${metrics.criticalCount}`} />
            )}
            {highPct > 0 && (
              <div style={{ width: `${highPct}%` }} className="bg-[#F59E0B] transition-all duration-300" title={`High: ${metrics.highCount}`} />
            )}
            {medPct > 0 && (
              <div style={{ width: `${medPct}%` }} className="bg-[#2563EB] transition-all duration-300" title={`Medium: ${metrics.mediumCount}`} />
            )}
            {lowPct > 0 && (
              <div style={{ width: `${lowPct}%` }} className="bg-[#98A2B3] transition-all duration-300" title={`Low / Info: ${metrics.lowCount}`} />
            )}
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => updateParams({ severity: severityFilter === "critical" ? null : "critical" })}
              className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                severityFilter === "critical"
                  ? "border-[#EF4444] bg-[#FEF3F2]"
                  : "border-[#E7EAF0] bg-[#FCFCFD] hover:border-[#D0D5DD]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#B91C1C]">
                <span className="size-2 rounded-full bg-[#EF4444]" />
                Critical
              </span>
              <span className="mt-1 font-mono text-[18px] font-bold text-[#111827] tabular-nums">{metrics.criticalCount}</span>
            </button>

            <button
              type="button"
              onClick={() => updateParams({ severity: severityFilter === "high" ? null : "high" })}
              className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                severityFilter === "high"
                  ? "border-[#F59E0B] bg-[#FFFAEB]"
                  : "border-[#E7EAF0] bg-[#FCFCFD] hover:border-[#D0D5DD]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#B45309]">
                <span className="size-2 rounded-full bg-[#F59E0B]" />
                High
              </span>
              <span className="mt-1 font-mono text-[18px] font-bold text-[#111827] tabular-nums">{metrics.highCount}</span>
            </button>

            <button
              type="button"
              onClick={() => updateParams({ severity: severityFilter === "medium" ? null : "medium" })}
              className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                severityFilter === "medium"
                  ? "border-[#2563EB] bg-[#EFF6FF]"
                  : "border-[#E7EAF0] bg-[#FCFCFD] hover:border-[#D0D5DD]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1D4ED8]">
                <span className="size-2 rounded-full bg-[#2563EB]" />
                Medium
              </span>
              <span className="mt-1 font-mono text-[18px] font-bold text-[#111827] tabular-nums">{metrics.mediumCount}</span>
            </button>

            <button
              type="button"
              onClick={() => updateParams({ severity: severityFilter === "low" ? null : "low" })}
              className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                severityFilter === "low"
                  ? "border-[#667085] bg-[#F2F4F7]"
                  : "border-[#E7EAF0] bg-[#FCFCFD] hover:border-[#D0D5DD]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#475467]">
                <span className="size-2 rounded-full bg-[#98A2B3]" />
                Low / Info
              </span>
              <span className="mt-1 font-mono text-[18px] font-bold text-[#111827] tabular-nums">{metrics.lowCount}</span>
            </button>
          </div>
        </div>

        {/* Triage Workflow Stages Card */}
        <div className="rounded-[16px] border border-[#E7EAF0] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[#111827]">Vulnerability Lifecycle Pipeline</h2>
              <p className="text-[12px] text-[#667085]">End-to-end report progression from initial submission to verified remediation</p>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E7EAF0] bg-[#F8FAFC] px-2.5 py-1 text-[12px] font-medium text-[#475467] hover:bg-[#F2F4F7] hover:text-[#111827]"
              >
                <X className="size-3.5" />
                Reset active filters
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { key: "new", label: "Submitted / New", count: metrics.newCount, sub: "Awaiting first response", dot: "bg-[#EF4444]", activeBg: "border-[#EF4444] bg-[#FEF3F2]" },
              { key: "triaging", label: "In Triage", count: metrics.triagingCount, sub: "Reproducing PoC", dot: "bg-[#F59E0B]", activeBg: "border-[#F59E0B] bg-[#FFFAEB]" },
              { key: "needs_information", label: "Needs Info", count: metrics.needsInfoCount, sub: "Researcher reply", dot: "bg-[#6366F1]", activeBg: "border-[#6366F1] bg-[#EEF2FF]" },
              { key: "accepted", label: "Accepted", count: metrics.acceptedCount, sub: "Engineering fix", dot: "bg-[#2563EB]", activeBg: "border-[#2563EB] bg-[#EFF6FF]" },
              { key: "resolved", label: "Resolved", count: metrics.resolvedCount, sub: "Patched & verified", dot: "bg-[#12B76A]", activeBg: "border-[#12B76A] bg-[#ECFDF3]" },
            ].map((stage) => {
              const isSelected = statusFilter === stage.key;
              return (
                <button
                  key={stage.key}
                  type="button"
                  onClick={() => updateParams({ status: isSelected ? null : stage.key })}
                  className={`flex flex-col justify-between rounded-xl border p-3 text-left transition ${
                    isSelected ? stage.activeBg : "border-[#E7EAF0] bg-[#FCFCFD] hover:border-[#D0D5DD] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`size-2 rounded-full ${stage.dot}`} />
                    <span className="font-mono text-[20px] font-bold text-[#111827] tabular-nums">{stage.count}</span>
                  </div>
                  <div className="mt-2">
                    <p className="text-[12px] font-semibold text-[#111827]">{stage.label}</p>
                    <p className="text-[11px] text-[#667085]">{stage.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. SEARCH & FILTER CONTROLS (Preserves exact E2E accessible labels and roles) */}
      <section className="rounded-[16px] border border-[#E7EAF0] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="space-y-4">
          <form role="search" aria-label="Search findings" onSubmit={handleSearchSubmit} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1">
              <Input
                label="Search findings"
                type="search"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search by vulnerability title, CWE, asset, or researcher..."
              />
            </div>
            <div className="w-full sm:w-48">
              <Select label="Order" value={sortOrder} onChange={(event) => updateParams({ sort: event.target.value })}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </Select>
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          <div className="grid grid-cols-1 gap-3 border-t border-[#E7EAF0] pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select label="Engagement" value={programFilter} onChange={(event) => updateParams({ program: event.target.value })}>
              <option value="all">All engagements</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </Select>
            <Select label="Filter by status" value={statusFilter} onChange={(event) => updateParams({ status: event.target.value })}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select label="Filter by severity" value={severityFilter} onChange={(event) => updateParams({ severity: event.target.value })}>
              <option value="all">All severities</option>
              {REPORT_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {severity.charAt(0).toUpperCase() + severity.slice(1)}
                </option>
              ))}
              <option value="unconfirmed">Unconfirmed</option>
            </Select>
            <Select label="Assigned to" value={assigneeFilter} onChange={(event) => updateParams({ assignee: event.target.value })}>
              <option value="all">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {staff
                .filter((member) => member.userId !== currentUserId)
                .map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName}
                  </option>
                ))}
            </Select>
          </div>
        </div>
      </section>

      {/* 4. FINDINGS QUEUE TABLE */}
      {reports.length === 0 ? (
        <div className="rounded-[16px] border border-[#E7EAF0] bg-white px-6 py-12 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-[#F8FAFC] text-[#667085]">
            <Search className="size-6" />
          </div>
          <p className="mt-3 text-[16px] font-semibold text-[#111827]">
            {hasActiveFilters ? "No findings match these filters" : "No findings submitted yet"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-[#667085]">
            {hasActiveFilters
              ? "Try clearing one or more filters or broadening your search terms to inspect all security reports."
              : "When security researchers submit vulnerability reports to your engagements, they appear here for triage."}
          </p>
          {hasActiveFilters && (
            <div className="mt-4">
              <Button type="button" variant="secondary" onClick={clearFilters}>
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-[#E7EAF0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7EAF0] bg-[#FCFCFD] px-5 py-3.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold text-[#111827]">Active Vulnerability Queue</h2>
              <span className="rounded-full bg-[#EEF2F6] px-2.5 py-0.5 font-mono text-[12px] font-semibold text-[#475467] tabular-nums">
                {total} {total === 1 ? "report" : "reports"}
              </span>
            </div>
            <p className="text-[12px] text-[#667085]">
              Click any finding title to open the full triage workspace, or use <span className="font-semibold text-[#111827]">Inspect PoC</span> for instant technical preview.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E7EAF0] text-left text-sm">
              <thead className="bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-wider text-[#667085]">
                <tr>
                  <th scope="col" className="py-3 pl-5 pr-3">Severity & CVSS</th>
                  <th scope="col" className="px-3 py-3">Vulnerability Finding</th>
                  <th scope="col" className="px-3 py-3">Engagement & Target</th>
                  <th scope="col" className="px-3 py-3">Status & SLA</th>
                  <th scope="col" className="px-3 py-3">Assignee</th>
                  <th scope="col" className="px-3 py-3">Researcher</th>
                  <th scope="col" className="px-3 py-3 text-right">Submitted</th>
                  <th scope="col" className="py-3 pl-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7EAF0] bg-white">
                {reports.map((report) => {
                  const tech = getFindingTechnicalFacts(report);
                  const detailHref = `/organizations/${organizationId}/programs/${report.programId}/reports/${report.id}` as Route;
                  const isInspected = inspectedReportId === report.id;

                  return (
                    <tr
                      key={report.id}
                      className={`group transition-colors ${
                        isInspected ? "bg-[#EFF6FF]/60" : "hover:bg-[#F8FAFC]"
                      }`}
                    >
                      {/* Severity & CVSS */}
                      <td className="whitespace-nowrap py-4 pl-5 pr-3 align-top">
                        <div className="flex flex-col items-start gap-1.5">
                          {report.confirmedSeverity ? (
                            <SeverityBadge severity={report.confirmedSeverity} />
                          ) : (
                            <span className="rounded-md bg-[#F2F4F7] px-2 py-0.5 text-[11px] font-medium text-[#667085]">Unconfirmed</span>
                          )}
                          <div className="flex items-center gap-1.5">
                            <span className="rounded border border-[#E7EAF0] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#111827] tabular-nums">
                              {tech.cvssScore !== null ? `CVSS ${tech.cvssScore.toFixed(1)}` : "Not scored"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Finding Title + CWE + Short ID */}
                      <td className="max-w-md px-3 py-4 align-top">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#667085]">
                          <span className="font-mono font-semibold text-[#475467]">#{report.id.slice(-6)}</span>
                          <span>·</span>
                          <span className="rounded bg-[#F2F4F7] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#344054]">
                            {tech.weakness ?? "Unclassified"}
                          </span>
                          <span>·</span>
                          <span className="font-medium text-[#475467]">{tech.environment}</span>
                        </div>
                        <Link
                          href={detailHref}
                          prefetch={false}
                          className="mt-1 block text-[14px] font-semibold leading-snug text-[#111827] transition-colors group-hover:text-[#2563EB] hover:underline"
                        >
                          <span>{report.title}</span>
                        </Link>
                        {tech.impactSummary && <p className="mt-1 line-clamp-1 text-[12px] text-[#667085]">{tech.impactSummary}</p>}
                      </td>

                      {/* Engagement & Target Asset */}
                      <td className="px-3 py-4 align-top">
                        <div className="text-[13px] font-medium text-[#111827]">{report.programName}</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="inline-block max-w-[14rem] truncate rounded border border-[#E7EAF0] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[11px] text-[#344054]">
                            {report.displayTarget}
                          </span>
                          {report.matchedScopeState === "in_scope" && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#12B76A]" title="Matches an in-scope entry">
                              <CheckCircle2 className="size-3" />
                              In scope
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status & SLA */}
                      <td className="whitespace-nowrap px-3 py-4 align-top">
                        <div className="flex flex-col items-start gap-1.5">
                          <StatusBadge status={report.status} />
                        </div>
                      </td>

                      {/* Assignee */}
                      <td className="whitespace-nowrap px-3 py-4 align-top">
                        {report.assigneeName ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#EEF2FF] text-[11px] font-bold text-[#2563EB]">
                              {report.assigneeName.charAt(0).toUpperCase()}
                            </span>
                            <span className="text-[13px] font-medium text-[#111827]">{report.assigneeName}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-[#D0D5DD] px-2 py-0.5 text-[12px] text-[#667085]">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Researcher */}
                      <td className="whitespace-nowrap px-3 py-4 align-top">
                        <div className="text-[13px] font-medium text-[#111827]">{report.researcherName}</div>
                        {report.researcherUsername && <div className="mt-0.5 font-mono text-[11px] text-[#667085]">@{report.researcherUsername}</div>}
                      </td>

                      {/* Submitted */}
                      <td className="whitespace-nowrap px-3 py-4 text-right align-top font-mono text-[12px] text-[#667085] tabular-nums">
                        <LocalTime value={report.submittedAt} />
                      </td>

                      {/* Quick Inspect + Open Workspace Actions */}
                      <td className="whitespace-nowrap py-4 pl-3 pr-5 text-right align-top">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectedReportId(isInspected ? null : report.id);
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition ${
                              isInspected
                                ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                                : "border-[#E7EAF0] bg-white text-[#344054] hover:border-[#D0D5DD] hover:bg-[#F8FAFC]"
                            }`}
                          >
                            <Terminal className="size-3.5" />
                            Inspect PoC
                          </button>
                          <Link
                            href={detailHref}
                            prefetch={false}
                            aria-label={`Open ${report.title}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#111827] px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#1F2937]"
                          >
                            Open
                            <ArrowUpRight className="size-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} label="findings" />

      {/* 5. SLIDE-OVER TECHNICAL FINDING INSPECTOR DRAWER */}
      {inspectedReport && inspectedEnrichment && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={`Technical preview for ${inspectedReport.title}`}
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-[#E7EAF0] bg-white shadow-[0_20px_50px_rgba(16,24,40,0.22)]"
        >
          {/* Drawer Header */}
          <div className="flex items-start justify-between gap-4 border-b border-[#E7EAF0] bg-[#FCFCFD] px-6 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {inspectedReport.confirmedSeverity && <SeverityBadge severity={inspectedReport.confirmedSeverity} />}
                <StatusBadge status={inspectedReport.status} />
                <span className="rounded border border-[#E7EAF0] bg-white px-2 py-0.5 font-mono text-[12px] font-bold text-[#111827]">
                  {inspectedEnrichment.cvssScore !== null ? `CVSS ${inspectedEnrichment.cvssScore.toFixed(1)}` : "Not scored"}
                </span>
                {inspectedEnrichment.weakness && (
                  <span className="rounded bg-[#F2F4F7] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#344054]">{inspectedEnrichment.weakness}</span>
                )}
              </div>
              <h3 className="mt-2 text-[17px] font-bold leading-snug text-[#111827]">{inspectedReport.title}</h3>
              <p className="mt-1 font-mono text-[12px] text-[#667085]">
                Target: <span className="font-semibold text-[#111827]">{inspectedReport.displayTarget}</span> · Researcher:{" "}
                <span className="font-semibold text-[#111827]">{inspectedReport.researcherName}{inspectedReport.researcherUsername ? ` (@${inspectedReport.researcherUsername})` : ""}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInspectedReportId(null)}
              aria-label="Close technical preview"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#E7EAF0] bg-white text-[#667085] hover:bg-[#F2F4F7] hover:text-[#111827]"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {/* The report's own scoring and impact; the full write-up, evidence and conversation are on the report page. */}
            <div className="rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-[#475467]">
                  {inspectedEnrichment.cvssVersion ? `CVSS v${inspectedEnrichment.cvssVersion}` : "CVSS"}
                </span>
                {inspectedEnrichment.cvssVector && (
                  <code className="max-w-full truncate rounded border border-[#E7EAF0] bg-white px-2 py-0.5 font-mono text-[11px] text-[#111827]">{inspectedEnrichment.cvssVector}</code>
                )}
              </div>
              <p className="mt-2 text-[13px] text-[#344054]">
                {inspectedEnrichment.cvssScore !== null ? `Base score ${inspectedEnrichment.cvssScore.toFixed(1)}` : "Not scored yet."} · {inspectedEnrichment.environment}
              </p>
            </div>

            <div>
              <h4 className="text-[13px] font-semibold uppercase tracking-wider text-[#475467]">Security Impact Assessment</h4>
              <p className="mt-1.5 whitespace-pre-line rounded-xl border border-[#E7EAF0] bg-white p-3.5 text-[13px] leading-relaxed text-[#344054]">
                {inspectedReport.impact?.trim() || "The researcher did not describe the impact separately."}
              </p>
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-[#E7EAF0] bg-[#FCFCFD] px-6 py-4">
            <div className="text-[12px] text-[#667085]">
              Component: <span className="font-mono font-semibold text-[#111827]">{inspectedEnrichment.affectedComponent}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInspectedReportId(null)}
                className="rounded-lg border border-[#E7EAF0] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#344054] hover:bg-[#F8FAFC]"
              >
                Close
              </button>
              <Link
                href={`/organizations/${organizationId}/programs/${inspectedReport.programId}/reports/${inspectedReport.id}` as Route}
                prefetch={false}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[#1D4ED8]"
              >
                Open Full Finding Workspace
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
