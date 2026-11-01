"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { getFindingTechnicalEnrichment } from "../../lib/findings-metrics";
import type { ReportSeverity, ReportStatus } from "../../types/report";
import {
  Terminal,
  Copy,
  Check,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Cpu,
  Globe,
  FileCode2,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Flame,
} from "lucide-react";

const FLAGSHIP_FINDINGS = [
  {
    id: "77777777-7777-4777-8777-777777777704",
    programId: "55555555-5555-4555-8555-555555555501",
    shortId: "#7704",
    label: "SSRF via DNS Rebinding (IMDSv2)",
    severity: "Critical · 9.1",
    status: "Triaging",
    badgeClass: "bg-[#FEF3F2] text-[#B91C1C] border-[#FECACA]",
  },
  {
    id: "77777777-7777-4777-8777-777777777705",
    programId: "55555555-5555-4555-8555-555555555501",
    shortId: "#7705",
    label: "SAML Signature Wrapping Auth Bypass",
    severity: "Critical · 9.8",
    status: "New",
    badgeClass: "bg-[#FEF3F2] text-[#B91C1C] border-[#FECACA]",
  },
  {
    id: "77777777-7777-4777-8777-777777777707",
    programId: "55555555-5555-4555-8555-555555555501",
    shortId: "#7707",
    label: "Multi-Tenant Billing Invoice IDOR",
    severity: "High · 8.3",
    status: "Accepted",
    badgeClass: "bg-[#FFFAEB] text-[#B45309] border-[#FDE68A]",
  },
  {
    id: "77777777-7777-4777-8777-777777777701",
    programId: "55555555-5555-4555-8555-555555555501",
    shortId: "#7701",
    label: "KMS Key Policy GraphQL Batch R/W",
    severity: "Critical · 9.6",
    status: "Resolved · $13.5k",
    badgeClass: "bg-[#ECFDF3] text-[#027A48] border-[#A7F3D0]",
  },
];

export function FindingSwitcherBar({
  organizationId,
  currentReportId,
}: {
  organizationId: string;
  currentReportId: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#E7EAF0] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-3">
        <Link
          href={`/organizations/${organizationId}/findings` as Route}
          prefetch={false}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-1.5 text-[12px] font-semibold text-[#344054] transition hover:bg-[#F2F4F7] hover:text-[#111827]"
        >
          <ArrowLeft className="size-3.5" />
          All Findings Queue
        </Link>
        <span className="hidden h-4 w-px bg-[#E7EAF0] sm:inline-block" />
        <span className="hidden text-[12px] font-semibold text-[#667085] lg:inline">Quick Switch Finding:</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FLAGSHIP_FINDINGS.map((item) => {
          const isCurrent = item.id === currentReportId;
          return (
            <Link
              key={item.id}
              href={`/organizations/${organizationId}/programs/${item.programId}/reports/${item.id}` as Route}
              prefetch={false}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[12px] transition ${
                isCurrent
                  ? "border-[#2563EB] bg-[#EFF6FF] font-semibold text-[#1D4ED8] shadow-2xs"
                  : "border-[#E7EAF0] bg-[#FCFCFD] font-medium text-[#344054] hover:border-[#D0D5DD] hover:bg-white"
              }`}
            >
              <span className="font-mono text-[11px] font-bold">{item.shortId}</span>
              <span className="max-w-[13rem] truncate">{item.label}</span>
              <span className={`rounded-full border px-1.5 py-0.2 text-[10px] font-semibold ${item.badgeClass}`}>
                {item.severity}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function FindingTechnicalTelemetryStrip({
  reportId,
  title,
  status,
  confirmedSeverity,
  displayTarget,
  researcherName,
}: {
  reportId: string;
  title: string;
  status: ReportStatus;
  confirmedSeverity: ReportSeverity | null;
  displayTarget: string;
  researcherName: string;
}) {
  const tech = getFindingTechnicalEnrichment({
    id: reportId,
    title,
    status,
    confirmedSeverity,
    displayTarget,
  });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {/* Card 1: CVSS v3.1 Score */}
      <div className="rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#667085]">CVSS v3.1 Base</span>
          <ShieldAlert className="size-4 text-[#EF4444]" />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-[26px] font-bold text-[#111827] tabular-nums">{tech.cvssScore.toFixed(1)}</span>
          <span className="rounded-full bg-[#FEF3F2] px-2 py-0.5 text-[11px] font-semibold text-[#B91C1C]">
            {tech.attackVector} · {tech.scope}
          </span>
        </div>
        <p className="mt-1 truncate font-mono text-[11px] text-[#667085]" title={tech.cvssVector}>
          {tech.cvssVector}
        </p>
      </div>

      {/* Card 2: Weakness Classification */}
      <div className="rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#667085]">Weakness (CWE)</span>
          <FileCode2 className="size-4 text-[#2563EB]" />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-[20px] font-bold text-[#111827]">{tech.cweId}</span>
          <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#2563EB]">OWASP API</span>
        </div>
        <p className="mt-1 truncate text-[12px] font-medium text-[#475467]" title={tech.cweName}>
          {tech.cweName}
        </p>
      </div>

      {/* Card 3: Affected Asset & Component */}
      <div className="rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#667085]">Affected Service</span>
          <Cpu className="size-4 text-[#667085]" />
        </div>
        <div className="mt-2 truncate font-mono text-[14px] font-bold text-[#111827]" title={tech.affectedComponent}>
          {tech.affectedComponent}
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[#12B76A]">
          <CheckCircle2 className="size-3.5" />
          <span className="truncate font-medium text-[#475467]">{tech.environment}</span>
        </p>
      </div>

      {/* Card 4: Response & Remediation SLA */}
      <div className="rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#667085]">SLA Status</span>
          <Clock className="size-4 text-[#F59E0B]" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              tech.slaTone === "danger" || tech.slaTone === "red"
                ? "bg-[#FEF3F2] text-[#B91C1C]"
                : tech.slaTone === "warning" || tech.slaTone === "amber"
                  ? "bg-[#FFFAEB] text-[#B45309]"
                  : tech.slaTone === "success" || tech.slaTone === "emerald"
                    ? "bg-[#ECFDF3] text-[#027A48]"
                    : "bg-[#F2F4F7] text-[#344054]"
            }`}
          >
            <span className="size-1.5 shrink-0 rounded-full bg-current" />
            <span className="truncate">{tech.slaStatusLabel}</span>
          </span>
        </div>
        <p className="mt-1.5 text-[12px] text-[#667085]">Enterprise P1 SLA Policy active</p>
      </div>

      {/* Card 5: Researcher Signal & Bounty Estimate */}
      <div className="rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#667085]">Researcher Signal</span>
          <ShieldCheck className="size-4 text-[#12B76A]" />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="font-mono text-[24px] font-bold text-[#111827] tabular-nums">
            {tech.researcherSignal.replace(/\s*Signal.*$/i, "")}
          </span>
          <span className="rounded-full bg-[#ECFDF3] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#12B76A] tabular-nums">
            {tech.bountyFormatted ?? "Tier 1 Scope"}
          </span>
        </div>
        <p className="mt-1 truncate text-[12px] text-[#667085]">@{researcherName} · Rep {tech.researcherReputation}</p>
      </div>
    </div>
  );
}

export function FindingExploitWorkbench({
  reportId,
  title,
  status,
  confirmedSeverity,
  displayTarget,
}: {
  reportId: string;
  title: string;
  status: ReportStatus;
  confirmedSeverity: ReportSeverity | null;
  displayTarget: string;
}) {
  const [activeTab, setActiveTab] = useState<"request" | "response" | "remediation">("request");
  const [copied, setCopied] = useState(false);

  const tech = getFindingTechnicalEnrichment({
    id: reportId,
    title,
    status,
    confirmedSeverity,
    displayTarget,
  });

  const activeCode =
    activeTab === "request"
      ? tech.httpRequest
      : activeTab === "response"
        ? tech.httpResponse
        : tech.remediationGuidance;

  function handleCopy() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(activeCode).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-[#E7EAF0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EAF0] bg-[#FCFCFD] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[#111827] text-white">
            <Terminal className="size-4" />
          </span>
          <div>
            <h2 className="text-[14px] font-semibold text-[#111827]">Technical Proof of Concept &amp; Remediation Workbench</h2>
            <p className="text-[12px] text-[#667085]">Captured HTTP/2 trace, response telemetry, and recommended engineering remediation</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("request")}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
              activeTab === "request" ? "bg-[#111827] text-white" : "text-[#475467] hover:bg-[#F2F4F7]"
            }`}
          >
            HTTP Request PoC
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("response")}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
              activeTab === "response" ? "bg-[#111827] text-white" : "text-[#475467] hover:bg-[#F2F4F7]"
            }`}
          >
            Captured Response
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("remediation")}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
              activeTab === "remediation" ? "bg-[#111827] text-white" : "text-[#475467] hover:bg-[#F2F4F7]"
            }`}
          >
            Remediation Guidance
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="ml-1 inline-flex items-center gap-1 rounded-lg border border-[#E7EAF0] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#344054] hover:bg-[#F8FAFC]"
          >
            {copied ? <Check className="size-3.5 text-[#12B76A]" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="p-5">
        <pre className="overflow-x-auto rounded-xl bg-[#0F172A] p-4 font-mono text-[12px] leading-relaxed text-[#E2E8F0]">
          <code>{activeCode}</code>
        </pre>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tech.reproductionSteps.map((step, index) => (
            <div key={index} className="rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] p-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#2563EB] font-mono text-[11px] font-bold text-white">
                  {index + 1}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#475467]">Step {index + 1}</span>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#344054]">{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
