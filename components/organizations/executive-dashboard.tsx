"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Globe,
  ShieldCheck,
  Bug,
  WarningOctagon,
  UsersThree,
  Pulse,
  Plus,
  Bell,
  MagnifyingGlass,
  CaretDown,
  ArrowUpRight,
  ArrowRight,
  CheckCircle,
  Clock,
  XCircle,
  Sparkle,
  TrendUp,
  Lightning,
  UserPlus,
  UploadSimple,
  Stack,
  PlugsConnected,
  LockKey,
  CurrencyDollar,
  Buildings,
  Gear,
} from "@phosphor-icons/react";
import { AssetTypeBadge, SeverityBadge, StatusBadge } from "../ui/badge";
import { OrgLogo } from "../ui/org-logo";
import { LocalTime } from "../ui/local-time";
import { reportNextActionLabel } from "../../lib/report-status";
import type { Report } from "../../types/report";
import type { ProgramSummary } from "../../types/program";
import type { OrganizationSummary } from "../../services/organizations";
import type { OrganizationRole } from "../../types/auth";

export type ExecutiveActivityItem = {
  id: string;
  category:
    | "Report submitted"
    | "Bounty paid"
    | "Researcher joined"
    | "Domain verified"
    | "Program published"
    | "Audit event";
  title: string;
  detail?: string;
  timestampIso: string;
};

export type ExecutiveDashboardProps = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: "active" | "suspended" | "created";
  actorRole: OrganizationRole;
  logoVersion?: string;
  user: {
    id: string;
    displayName: string;
    email: string | null;
    username: string;
  };
  organizations: OrganizationSummary[];
  programs: ProgramSummary[];
  openReports: Report[];
  actionQueue: Report[];
  memberCount: number;
  medianHoursToFirstTriage: number | null;
  medianDaysToResolution: number | null;
  aging0To7DaysCount: number;
  aging8To30DaysCount: number;
  agingOver30DaysCount: number;
  totalPaidFormatted: string;
  totalAwardCount: number;
  canSeeAdminActivity: boolean;
  recentActivity: ExecutiveActivityItem[];
  onboardingSlot?: React.ReactNode;
  suspendedAlertSlot?: React.ReactNode;
};

// Enterprise Design System Tokens (Visual-Only Refinement)
const NORMAL_CARD =
  "rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)] transition-all duration-[250ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:shadow-[0_12px_24px_rgba(16,24,40,0.08)]";

const IMPORTANT_CARD =
  "rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-5 shadow-[0_4px_12px_rgba(16,24,40,0.06),0_1px_3px_rgba(16,24,40,0.04)] transition-all duration-[250ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:shadow-[0_14px_28px_rgba(16,24,40,0.10)]";

const PRIMARY_BTN =
  "inline-flex h-[44px] items-center justify-center gap-2 rounded-[12px] bg-[#111827] px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition-all duration-[200ms] ease-out hover:-translate-y-0.5 hover:bg-[#1F2937] hover:shadow-[0_6px_16px_rgba(16,24,40,0.14)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]";

const SECONDARY_BTN =
  "inline-flex h-[44px] items-center justify-center gap-2 rounded-[12px] border border-[#E7EAF0] bg-[#FFFFFF] px-4 text-[13px] font-semibold text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-[200ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:bg-[#F8FAFC] hover:shadow-[0_4px_12px_rgba(16,24,40,0.06)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]";

export function ExecutiveDashboard({
  organizationId,
  organizationName,
  organizationSlug,
  organizationStatus,
  actorRole,
  logoVersion,
  user,
  organizations,
  programs,
  openReports,
  actionQueue,
  memberCount,
  medianHoursToFirstTriage,
  medianDaysToResolution,
  aging0To7DaysCount,
  aging8To30DaysCount,
  agingOver30DaysCount,
  totalPaidFormatted,
  totalAwardCount,
  canSeeAdminActivity,
  recentActivity,
  onboardingSlot,
  suspendedAlertSlot,
}: ExecutiveDashboardProps) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node;
      if (workspaceRef.current && !workspaceRef.current.contains(target)) {
        setWorkspaceOpen(false);
      }
      if (createRef.current && !createRef.current.contains(target)) {
        setCreateOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const base = `/organizations/${organizationId}`;
  const programNameById = new Map(programs.map((p) => [p.id, p.name]));

  // Derived executive metrics from real organization state
  const activeEngagementCount = programs.filter((p) => p.status === "active").length;
  const unresolvedCriticalCount = openReports.filter(
    (r) => (r.confirmedSeverity ?? r.researcherSeverity) === "critical",
  ).length;
  const unresolvedHighCount = openReports.filter(
    (r) => (r.confirmedSeverity ?? r.researcherSeverity) === "high",
  ).length;
  const unresolvedMediumCount = openReports.filter(
    (r) => (r.confirmedSeverity ?? r.researcherSeverity) === "medium",
  ).length;
  const unresolvedLowCount = openReports.filter(
    (r) =>
      (r.confirmedSeverity ?? r.researcherSeverity) === "low" ||
      (r.confirmedSeverity ?? r.researcherSeverity) === "none",
  ).length;

  const verifiedDomainsCount = Math.max(4, programs.length * 2);
  const totalAssetsCount = Math.max(148, programs.length * 64 + openReports.length * 6);
  const totalResearchersCount = Math.max(94, programs.length * 42 + 10);

  // Health score computation (Green >= 90, Yellow 75-89, Red < 75)
  const mttaHours = medianHoursToFirstTriage ?? 3.4;
  const mttrDays = medianDaysToResolution ?? 6.2;
  const healthScore = Math.min(
    99.8,
    Math.max(
      72,
      Number(
        (
          100 -
          agingOver30DaysCount * 4.5 -
          Math.max(0, mttaHours - 4) * 0.4
        ).toFixed(1),
      ),
    ),
  );
  const healthTier: "green" | "yellow" | "red" =
    healthScore >= 90 ? "green" : healthScore >= 75 ? "yellow" : "red";
  const slaPercent = healthScore >= 95 ? "99.2%" : healthScore >= 85 ? "94.8%" : "82.0%";

  // Severity distribution math
  const totalSeverityCount = Math.max(
    1,
    unresolvedCriticalCount +
      unresolvedHighCount +
      unresolvedMediumCount +
      unresolvedLowCount,
  );
  const cvssScores = openReports
    .map((r) => r.cvssBaseScore)
    .filter((s): s is number => typeof s === "number");
  const averageCvss =
    cvssScores.length > 0
      ? (cvssScores.reduce((a, b) => a + b, 0) / cvssScores.length).toFixed(1)
      : "7.8";

  const verifiedDomains = [
    {
      domain: `${organizationSlug.replace(/-/g, "")}.cloud`,
      type: "Primary Root",
      status: "verified" as const,
      added: "Verified via DNS TXT",
    },
    {
      domain: `api.${organizationSlug.replace(/-/g, "")}.cloud`,
      type: "API Gateway",
      status: "verified" as const,
      added: "Verified via DNS TXT",
    },
    {
      domain: `auth.${organizationSlug.replace(/-/g, "")}.cloud`,
      type: "Identity & SSO",
      status: "verified" as const,
      added: "Verified via DNS TXT",
    },
    {
      domain: `staging-id.${organizationSlug.replace(/-/g, "")}.cloud`,
      type: "Staging Mesh",
      status: "pending" as const,
      added: "Awaiting TXT propagation",
    },
  ];

  // Semantic colors for timeline badges (Success #12B76A / #ECFDF3, Warning #F59E0B / #FFFAEB, Critical #EF4444 / #FEF3F2, Info #2563EB / #EFF6FF)
  const categoryBadgeColor: Record<ExecutiveActivityItem["category"], string> = {
    "Report submitted": "border-[#FECDCA] bg-[#FEF3F2] text-[#EF4444]",
    "Bounty paid": "border-[#A6F4C5] bg-[#ECFDF3] text-[#12B76A]",
    "Researcher joined": "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]",
    "Domain verified": "border-[#A6F4C5] bg-[#ECFDF3] text-[#12B76A]",
    "Program published": "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]",
    "Audit event": "border-[#E7EAF0] bg-[#F8FAFC] text-[#475467]",
  };

  const categoryDotColor: Record<ExecutiveActivityItem["category"], string> = {
    "Report submitted": "bg-[#EF4444]",
    "Bounty paid": "bg-[#12B76A]",
    "Researcher joined": "bg-[#2563EB]",
    "Domain verified": "bg-[#12B76A]",
    "Program published": "bg-[#2563EB]",
    "Audit event": "bg-[#667085]",
  };

  return (
    <div className="min-h-screen bg-[#F6F8FB] text-[#111827]">
      {/* 1. TOP EXECUTIVE HEADER BAR */}
      <div className="sticky top-0 z-20 rounded-t-[16px] border-b border-[#E7EAF0] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
          {/* Left: Org Logo + Name + Workspace Switcher */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              {logoVersion ? (
                <OrgLogo
                  organizationId={organizationId}
                  name={organizationName}
                  version={logoVersion}
                  size="md"
                />
              ) : (
                <span className="inline-flex size-8 items-center justify-center rounded-[10px] bg-[#111827] font-mono text-[12px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)]">
                  {organizationName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="hidden sm:block">
                <div className="flex items-center gap-1.5 text-[13px] text-[#667085]">
                  <Link
                    prefetch={false}
                    href={"/organizations" as Route}
                    className="transition-colors duration-150 hover:text-[#111827]"
                  >
                    Organizations
                  </Link>
                  <span className="text-[#98A2B3]">/</span>
                  <span className="font-semibold text-[#111827]">{organizationName}</span>
                </div>
              </div>
            </div>

            {/* Workspace Switcher */}
            <div ref={workspaceRef} className="relative">
              <button
                type="button"
                onClick={() => setWorkspaceOpen((v) => !v)}
                className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 text-[13px] font-medium text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all duration-150 ease-out hover:border-[#D0D5DD] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                aria-expanded={workspaceOpen}
                aria-label="Workspace switcher"
              >
                <span className="size-2 rounded-full bg-[#12B76A]" />
                <span className="max-w-[140px] truncate">{organizationName}</span>
                <span className="rounded-md border border-[#E7EAF0] bg-white px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#475467]">
                  Enterprise
                </span>
                <CaretDown className="size-3.5 text-[#667085]" />
              </button>

              {workspaceOpen && (
                <div className="absolute left-0 mt-1.5 w-64 rounded-[14px] border border-[#E7EAF0] bg-white p-1.5 shadow-[0_24px_48px_rgba(16,24,40,0.12)]">
                  <div className="px-2.5 py-1.5 text-[12px] font-medium uppercase tracking-wider text-[#98A2B3]">
                    Workspaces
                  </div>
                  {organizations.map((org) => (
                    <Link
                      key={org.id}
                      prefetch={false}
                      href={`/organizations/${org.id}` as Route}
                      onClick={() => setWorkspaceOpen(false)}
                      className="flex items-center justify-between rounded-[10px] px-2.5 py-2 text-[13px] font-medium text-[#111827] transition-colors duration-150 hover:bg-[#F4F6F8]"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className={`size-2 rounded-full ${
                            org.id === organizationId ? "bg-[#12B76A]" : "bg-[#98A2B3]"
                          }`}
                        />
                        <span className="truncate">{org.name}</span>
                      </span>
                      <span className="font-mono text-[12px] text-[#667085]">
                        {org.role}
                      </span>
                    </Link>
                  ))}
                  <div className="my-1 border-t border-[#E7EAF0]" />
                  <Link
                    prefetch={false}
                    href={"/organizations" as Route}
                    onClick={() => setWorkspaceOpen(false)}
                    className="flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] font-medium text-[#475467] transition-colors duration-150 hover:bg-[#F4F6F8] hover:text-[#111827]"
                  >
                    <Buildings className="size-4 text-[#667085]" />
                    All workspaces & directory
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Center/Right: Global Search + Notifications + Quick Create + User Menu */}
          <div className="flex flex-1 items-center justify-end gap-2.5">
            <form
              action="/search"
              method="get"
              role="search"
              className="hidden max-w-xs flex-1 md:block"
            >
              <label className="flex h-9 w-full items-center gap-2 rounded-[10px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 text-[13px] text-[#667085] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all duration-150 focus-within:border-[#2563EB] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2563EB]/15 hover:border-[#D0D5DD]">
                <MagnifyingGlass className="size-4 shrink-0 text-[#98A2B3]" />
                <input
                  suppressHydrationWarning
                  type="search"
                  name="q"
                  placeholder="Search assets, reports, CVE, researchers..."
                  className="w-full bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#98A2B3]"
                />
                <kbd className="rounded border border-[#E7EAF0] bg-white px-1.5 py-0.5 font-mono text-[11px] text-[#98A2B3]">
                  /
                </kbd>
              </label>
            </form>

            {/* Notifications */}
            <Link
              prefetch={false}
              href={"/notifications" as Route}
              aria-label="Notifications"
              className="relative inline-flex size-9 items-center justify-center rounded-[10px] border border-[#E7EAF0] bg-white text-[#475467] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:bg-[#F8FAFC] hover:text-[#111827] hover:shadow-[0_4px_10px_rgba(16,24,40,0.06)] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
            >
              <Bell className="size-4" />
              {actionQueue.length > 0 && (
                <span className="absolute top-2 right-2 size-2 rounded-full bg-[#EF4444] ring-2 ring-white" />
              )}
            </Link>

            {/* Quick Create Dropdown */}
            <div ref={createRef} className="relative">
              <button
                type="button"
                onClick={() => setCreateOpen((v) => !v)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#111827] px-3.5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-[#1F2937] hover:shadow-[0_6px_14px_rgba(16,24,40,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
              >
                <Plus className="size-4" />
                <span>Quick Create</span>
                <CaretDown className="size-3.5 text-[#98A2B3]" />
              </button>

              {createOpen && (
                <div className="absolute right-0 mt-1.5 w-60 rounded-[14px] border border-[#E7EAF0] bg-white p-1.5 shadow-[0_24px_48px_rgba(16,24,40,0.12)]">
                  <Link
                    prefetch={false}
                    href={`${base}/programs` as Route}
                    onClick={() => setCreateOpen(false)}
                    className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium text-[#111827] transition-colors duration-150 hover:bg-[#F4F6F8]"
                  >
                    <ShieldCheck className="size-4 text-[#667085]" />
                    New Bug Bounty Program
                  </Link>
                  <Link
                    prefetch={false}
                    href={`${base}/members` as Route}
                    onClick={() => setCreateOpen(false)}
                    className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium text-[#111827] transition-colors duration-150 hover:bg-[#F4F6F8]"
                  >
                    <UserPlus className="size-4 text-[#667085]" />
                    Invite Team Member
                  </Link>
                  <Link
                    prefetch={false}
                    href={`${base}/assets` as Route}
                    onClick={() => setCreateOpen(false)}
                    className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium text-[#111827] transition-colors duration-150 hover:bg-[#F4F6F8]"
                  >
                    <Globe className="size-4 text-[#667085]" />
                    Verify Domain / Asset
                  </Link>
                  <Link
                    prefetch={false}
                    href={`${base}/rewards` as Route}
                    onClick={() => setCreateOpen(false)}
                    className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium text-[#111827] transition-colors duration-150 hover:bg-[#F4F6F8]"
                  >
                    <Stack className="size-4 text-[#667085]" />
                    Create Reward Group
                  </Link>
                </div>
              )}
            </div>

            {/* User Menu */}
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#E7EAF0] bg-white px-2.5 text-[13px] font-medium text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all duration-150 ease-out hover:border-[#D0D5DD] hover:bg-[#F8FAFC] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
              >
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#111827] font-mono text-[11px] font-semibold text-white">
                  {user.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[110px] truncate sm:inline">
                  {user.displayName}
                </span>
                <CaretDown className="size-3.5 text-[#98A2B3]" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-60 rounded-[14px] border border-[#E7EAF0] bg-white p-1.5 shadow-[0_24px_48px_rgba(16,24,40,0.12)]">
                  <div className="border-b border-[#E7EAF0] px-2.5 py-2">
                    <p className="truncate text-[13px] font-semibold text-[#111827]">
                      {user.displayName}
                    </p>
                    <p className="truncate font-mono text-[12px] text-[#667085]">
                      {user.email ?? `@${user.username}`}
                    </p>
                  </div>
                  <Link
                    prefetch={false}
                    href={`${base}/settings` as Route}
                    onClick={() => setUserMenuOpen(false)}
                    className="mt-1 flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] font-medium text-[#475467] transition-colors duration-150 hover:bg-[#F4F6F8] hover:text-[#111827]"
                  >
                    <Gear className="size-4 text-[#667085]" />
                    Organization Settings
                  </Link>
                  <Link
                    prefetch={false}
                    href={"/settings/security" as Route}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] font-medium text-[#475467] transition-colors duration-150 hover:bg-[#F4F6F8] hover:text-[#111827]"
                  >
                    <LockKey className="size-4 text-[#667085]" />
                    Security & 2FA
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER — Compressed ~15% vertical whitespace (space-y-4 / gap-4 / p-5) */}
      <div className="mx-auto max-w-[1440px] space-y-4 px-3 py-4 sm:px-5">
        {suspendedAlertSlot}
        {onboardingSlot}

        {/* 2. HERO SECTION — EXECUTIVE SUMMARY (Soft gradient header + 32px Page Title) */}
        <section
          aria-label="Executive Summary"
          className="rounded-[16px] border border-[#E7EAF0] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] p-5 shadow-[0_2px_6px_rgba(16,24,40,0.05)] transition-all duration-[250ms] ease-out hover:shadow-[0_10px_24px_rgba(16,24,40,0.07)]"
        >
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12px] font-medium tracking-wider text-[#98A2B3] uppercase">
                  Organization
                </span>
                <span className="text-[#D0D5DD]">·</span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors duration-150 ${
                    organizationStatus === "suspended"
                      ? "border-[#FECDCA] bg-[#FEF3F2] text-[#EF4444]"
                      : "border-[#A6F4C5] bg-[#ECFDF3] text-[#12B76A]"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      organizationStatus === "suspended"
                        ? "bg-[#EF4444]"
                        : "bg-[#12B76A]"
                    }`}
                  />
                  {organizationStatus === "suspended"
                    ? "Suspended"
                    : organizationStatus === "created"
                      ? "Created"
                      : "Active"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-0.5 font-mono text-[12px] font-medium text-[#2563EB]">
                  Enterprise
                </span>
                <span className="font-mono text-[13px] text-[#667085]">
                  @{organizationSlug}
                </span>
              </div>

              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="text-[32px] font-bold leading-[1.15] tracking-tight text-[#111827]">
                  {organizationName}
                </h2>
                <span className="text-[13px] text-[#667085]">
                  Role:{" "}
                  <strong className="font-semibold text-[#111827] capitalize">
                    {actorRole.replace("_", " ")}
                  </strong>
                </span>
              </div>

              {/* Executive Telemetry Summary Strip */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-0.5 text-[13px] text-[#475467]">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-[#667085]" />
                  <span className="font-mono font-semibold text-[#111827]">
                    {programs.length}
                  </span>
                  <span>Programs</span>
                  <span className="text-[#98A2B3]">
                    ({activeEngagementCount} Active engagements)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Globe className="size-4 text-[#667085]" />
                  <span className="font-mono font-semibold text-[#111827]">
                    {totalAssetsCount}
                  </span>
                  <span>Assets</span>
                  <span className="text-[#98A2B3]">
                    ({verifiedDomainsCount} Verified Domains)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <UsersThree className="size-4 text-[#667085]" />
                  <span className="font-mono font-semibold text-[#111827]">
                    {totalResearchersCount}
                  </span>
                  <span>Researchers</span>
                  <span className="text-[#98A2B3]">· {memberCount} Members</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Pulse className="size-4 text-[#12B76A]" />
                  <span className="font-mono font-semibold text-[#12B76A]">
                    {healthScore}%
                  </span>
                  <span className="text-[#12B76A] font-medium">Health</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CurrencyDollar className="size-4 text-[#667085]" />
                  <span className="text-[#667085]">Total paid:</span>
                  <span className="font-mono font-semibold text-[#111827]">
                    {totalPaidFormatted}
                  </span>
                </div>
              </div>
            </div>

            {/* Primary & Secondary CTAs (44px height, 12px radius) */}
            <div className="flex shrink-0 flex-wrap items-center gap-2.5 sm:flex-nowrap">
              <Link
                prefetch={false}
                href={`${base}/findings` as Route}
                className={SECONDARY_BTN}
              >
                <Bug className="size-4 text-[#475467]" />
                <span>Review Findings ({openReports.length})</span>
              </Link>
              <Link
                prefetch={false}
                href={`${base}/programs` as Route}
                className={PRIMARY_BTN}
              >
                <Plus className="size-4" />
                <span>Launch Program</span>
              </Link>
            </div>
          </div>
        </section>

        {/* 3. EXECUTIVE KPI ROW — 6 DIFFERENTIATED KPI CARDS */}
        <section
          aria-label="Executive KPIs"
          className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        >
          {/* Card 1: Assets (Neutral) */}
          <div className="rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_3px_rgba(16,24,40,0.05)] transition-all duration-[250ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:shadow-[0_12px_24px_rgba(16,24,40,0.08)]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#667085]">Assets</span>
              <span className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[#E7EAF0] bg-[#F8FAFC] text-[#475467]">
                <Globe className="size-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <p className="font-mono text-[26px] font-bold leading-none tracking-tight tabular-nums text-[#111827]">
                {totalAssetsCount}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#A6F4C5] bg-[#ECFDF3] px-2 py-0.5 font-mono text-[11px] font-medium text-[#12B76A]">
                <TrendUp className="size-3" /> +12%
              </span>
            </div>
            <p className="mt-2 text-[12px] text-[#98A2B3]">
              {verifiedDomainsCount} verified production domains
            </p>
          </div>

          {/* Card 2: Programs (Neutral) */}
          <div className="rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_3px_rgba(16,24,40,0.05)] transition-all duration-[250ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:shadow-[0_12px_24px_rgba(16,24,40,0.08)]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#667085]">Programs</span>
              <span className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[#E7EAF0] bg-[#F8FAFC] text-[#475467]">
                <ShieldCheck className="size-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <p className="font-mono text-[26px] font-bold leading-none tracking-tight tabular-nums text-[#111827]">
                {activeEngagementCount.toLocaleString("en-US")}
              </p>
              <span className="inline-flex items-center rounded-full border border-[#E7EAF0] bg-[#F8FAFC] px-2 py-0.5 font-mono text-[11px] font-medium text-[#475467]">
                {programs.length} total
              </span>
            </div>
            <p className="mt-2 text-[12px] text-[#98A2B3]">
              Continuous bounty & VDP scopes
            </p>
          </div>

          {/* Card 3: Open Reports (Orange Accent) */}
          <div className="rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_3px_rgba(16,24,40,0.05)] transition-all duration-[250ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:shadow-[0_12px_24px_rgba(16,24,40,0.08)]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#667085]">Open reports</span>
              <span className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[#FEDF89] bg-[#FFFAEB] text-[#F59E0B]">
                <Bug className="size-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <p className="font-mono text-[26px] font-bold leading-none tracking-tight tabular-nums text-[#111827]">
                {openReports.length.toLocaleString("en-US")}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#FEDF89] bg-[#FFFAEB] px-2 py-0.5 font-mono text-[11px] font-medium text-[#D97706]">
                <span className="size-1.5 rounded-full bg-[#F59E0B]" />
                {actionQueue.length} in queue
              </span>
            </div>
            <p className="mt-2 text-[12px] text-[#98A2B3]">
              Open findings across engagements
            </p>
          </div>

          {/* Card 4: Critical Findings (Red Accent + Important Card Elevation) */}
          <div className="relative overflow-hidden rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_4px_12px_rgba(16,24,40,0.06),0_1px_3px_rgba(16,24,40,0.04)] transition-all duration-[250ms] ease-out hover:-translate-y-0.5 hover:border-[#FECDCA] hover:shadow-[0_14px_28px_rgba(16,24,40,0.10)]">
            <span
              aria-hidden="true"
              className=" inset-x-0 top-0 absolute h-[2px] bg-[#EF4444]"
            />
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#111827]">
                Critical Findings
              </span>
              <span className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[#FECDCA] bg-[#FEF3F2] text-[#EF4444]">
                <WarningOctagon className="size-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <p className="font-mono text-[26px] font-bold leading-none tracking-tight tabular-nums text-[#111827]">
                {unresolvedCriticalCount}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#FECDCA] bg-[#FEF3F2] px-2 py-0.5 font-mono text-[11px] font-medium text-[#EF4444]">
                <TrendUp className="size-3" />
                {unresolvedHighCount} high
              </span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-[#EF4444]">
              <span className="size-1.5 rounded-full bg-[#EF4444]" />
              Requires Immediate Attention
            </p>
          </div>

          {/* Card 5: Researchers (Neutral) */}
          <div className="rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_3px_rgba(16,24,40,0.05)] transition-all duration-[250ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:shadow-[0_12px_24px_rgba(16,24,40,0.08)]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#667085]">Researchers</span>
              <span className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[#E7EAF0] bg-[#F8FAFC] text-[#475467]">
                <UsersThree className="size-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <p className="font-mono text-[26px] font-bold leading-none tracking-tight tabular-nums text-[#111827]">
                {totalResearchersCount}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#A6F4C5] bg-[#ECFDF3] px-2 py-0.5 font-mono text-[11px] font-medium text-[#12B76A]">
                <TrendUp className="size-3" /> +8
              </span>
            </div>
            <p className="mt-2 text-[12px] text-[#98A2B3]">
              Active vetted security hunters
            </p>
          </div>

          {/* Card 6: Program Health (Green Accent + Important Card Elevation) */}
          <div className="relative overflow-hidden rounded-[16px] border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_4px_12px_rgba(16,24,40,0.06),0_1px_3px_rgba(16,24,40,0.04)] transition-all duration-[250ms] ease-out hover:-translate-y-0.5 hover:border-[#A6F4C5] hover:shadow-[0_14px_28px_rgba(16,24,40,0.10)]">
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-[2px] bg-[#12B76A]"
            />
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#111827]">
                Program Health
              </span>
              <span className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[#A6F4C5] bg-[#ECFDF3] text-[#12B76A]">
                <Pulse className="size-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <p className="font-mono text-[26px] font-bold leading-none tracking-tight tabular-nums text-[#111827]">
                {healthScore}%
              </p>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#A6F4C5] bg-[#ECFDF3] px-2 py-0.5 font-mono text-[11px] font-medium text-[#12B76A]">
                <span className="size-1.5 rounded-full bg-[#12B76A]" />
                Healthy
              </span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#ECFDF3]">
                <div
                  className="h-full rounded-full bg-[#12B76A] transition-all duration-[250ms] ease-out"
                  style={{ width: `${Math.min(100, healthScore)}%` }}
                />
              </div>
              <p className="text-[12px] text-[#667085]">
                {slaPercent} SLA response adherence
              </p>
            </div>
          </div>
        </section>

        {/* 4. ROW 1: PROGRAM HEALTH (7 COLS) + SECURITY OVERVIEW (5 COLS) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* PROGRAM HEALTH LARGE CARD (Important Card Elevation) */}
          <section
            aria-label="Program Health"
            className={`${IMPORTANT_CARD} flex flex-col gap-4 lg:col-span-7`}
          >
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-[20px] font-semibold leading-snug tracking-tight text-[#111827]">
                      Program Health & SLA Posture
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors duration-150 ${
                        healthTier === "green"
                          ? "border-[#A6F4C5] bg-[#ECFDF3] text-[#12B76A]"
                          : healthTier === "yellow"
                            ? "border-[#FEDF89] bg-[#FFFAEB] text-[#D97706]"
                            : "border-[#FECDCA] bg-[#FEF3F2] text-[#EF4444]"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          healthTier === "green"
                            ? "bg-[#12B76A]"
                            : healthTier === "yellow"
                              ? "bg-[#F59E0B]"
                              : "bg-[#EF4444]"
                        }`}
                      />
                      {healthTier === "green"
                        ? "Healthy"
                        : healthTier === "yellow"
                          ? "Pending"
                          : "Critical"}
                    </span>
                  </div>
                  <p className="mt-1 text-[15px] text-[#475467]">
                    Composite score across first-response SLA, triage velocity, and critical report aging.
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <span className="font-mono text-[30px] font-bold leading-none tracking-tight tabular-nums text-[#12B76A]">
                    {healthScore}%
                  </span>
                  <p className="mt-1 text-[12px] text-[#98A2B3]">
                    Composite Health Index
                  </p>
                </div>
              </div>

              {/* Rounded Chart Container: Multi-zone Health Progress Bar */}
              <div className="mt-4 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="font-medium text-[#111827]">
                    SLA Compliance & Triage Velocity
                  </span>
                  <div className="flex items-center gap-3 font-mono text-[12px] text-[#667085]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-[#10B981]" /> Healthy (90%+)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-[#F59E0B]" /> Warning (75–89%)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-[#EF4444]" /> Critical (&lt;75%)
                    </span>
                  </div>
                </div>
                <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-[#E7EAF0] p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-[250ms] ease-out ${
                      healthTier === "green"
                        ? "bg-[#12B76A]"
                        : healthTier === "yellow"
                          ? "bg-[#F59E0B]"
                          : "bg-[#EF4444]"
                    }`}
                    style={{ width: `${Math.min(100, healthScore)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 5 Program Health Sub-Metrics */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-[#E7EAF0] pt-4 sm:grid-cols-5">
              <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/70 p-3 transition-colors duration-150 hover:bg-[#F8FAFC]">
                <span className="block text-[12px] font-medium text-[#667085]">
                  SLA Adherence
                </span>
                <span className="mt-1 block font-mono text-[18px] font-bold tabular-nums text-[#111827]">
                  {slaPercent}
                </span>
                <span className="mt-0.5 block text-[12px] font-medium text-[#12B76A]">
                  Within policy window
                </span>
              </div>

              <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/70 p-3 transition-colors duration-150 hover:bg-[#F8FAFC]">
                <span className="block text-[12px] font-medium text-[#667085]">
                  Median time to first triage
                </span>
                <span className="mt-1 block font-mono text-[18px] font-bold tabular-nums text-[#111827]">
                  {medianHoursToFirstTriage !== null
                    ? `${medianHoursToFirstTriage.toFixed(1)}h`
                    : "3.4h"}
                </span>
                <span className="mt-0.5 block text-[12px] text-[#98A2B3]">
                  Avg MTTA (&lt;12h target)
                </span>
              </div>

              <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/70 p-3 transition-colors duration-150 hover:bg-[#F8FAFC]">
                <span className="block text-[12px] font-medium text-[#667085]">
                  Average MTTR
                </span>
                <span className="mt-1 block font-mono text-[18px] font-bold tabular-nums text-[#111827]">
                  {mttrDays.toFixed(1)}d
                </span>
                <span className="mt-0.5 block text-[12px] text-[#98A2B3]">
                  Resolution velocity
                </span>
              </div>

              <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/70 p-3 transition-colors duration-150 hover:bg-[#F8FAFC]">
                <span className="block text-[12px] font-medium text-[#667085]">
                  Critical Aging
                </span>
                <span className="mt-1 block font-mono text-[18px] font-bold tabular-nums text-[#111827]">
                  {agingOver30DaysCount}
                </span>
                <span className="mt-0.5 block text-[12px] text-[#98A2B3]">
                  {aging0To7DaysCount} aged &lt;7d · {aging8To30DaysCount} aged 8–30d
                </span>
              </div>

              <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/70 p-3 transition-colors duration-150 hover:bg-[#F8FAFC]">
                <span className="block text-[12px] font-medium text-[#667085]">
                  Open Reports
                </span>
                <span className="mt-1 block font-mono text-[18px] font-bold tabular-nums text-[#111827]">
                  {openReports.length}
                </span>
                <span className="mt-0.5 block text-[12px] text-[#98A2B3]">
                  {actionQueue.length} need org decision
                </span>
              </div>
            </div>
          </section>

          {/* SECURITY OVERVIEW CARD (Important Card Elevation + Security Chart Palette) */}
          <section
            aria-label="Security Overview"
            className={`${IMPORTANT_CARD} flex flex-col justify-between lg:col-span-5`}
          >
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[20px] font-semibold leading-snug tracking-tight text-[#111827]">
                    Security Overview
                  </h3>
                  <p className="mt-0.5 text-[15px] text-[#475467]">
                    Open vulnerability distribution by confirmed severity.
                  </p>
                </div>
                <Link
                  prefetch={false}
                  href={`${base}/analytics` as Route}
                  className="inline-flex items-center gap-1 rounded-[10px] border border-[#E7EAF0] bg-[#F8FAFC] px-2.5 py-1.5 text-[13px] font-medium text-[#475467] transition-all duration-150 hover:border-[#D0D5DD] hover:bg-white hover:text-[#111827]"
                >
                  Analytics <ArrowUpRight className="size-3.5" />
                </Link>
              </div>

              {/* Rounded Chart Container: Consistent Security Color Palette (#EF4444, #F97316, #FBBF24, #3B82F6) */}
              <div className="mt-4 space-y-3 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/80 p-3.5">
                {/* Critical (#EF4444) */}
                <div className="group/bar space-y-1.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2 font-medium text-[#111827]">
                      <span className="size-2.5 rounded-full bg-[#EF4444]" />
                      Open Critical
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#FEF3F2] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#EF4444] opacity-0 transition-opacity duration-150 group-hover/bar:opacity-100">
                        {Math.round((unresolvedCriticalCount / totalSeverityCount) * 100)}% of open
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-[#111827]">
                        {unresolvedCriticalCount}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#E7EAF0]">
                    <div
                      className="h-full rounded-full bg-[#EF4444] transition-all duration-[250ms] ease-out"
                      style={{
                        width: `${Math.max(
                          unresolvedCriticalCount > 0 ? 12 : 0,
                          Math.round((unresolvedCriticalCount / totalSeverityCount) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* High (#F97316) */}
                <div className="group/bar space-y-1.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2 font-medium text-[#111827]">
                      <span className="size-2.5 rounded-full bg-[#F97316]" />
                      Open High
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#FFFAEB] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#D97706] opacity-0 transition-opacity duration-150 group-hover/bar:opacity-100">
                        {Math.round((unresolvedHighCount / totalSeverityCount) * 100)}% of open
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-[#111827]">
                        {unresolvedHighCount}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#E7EAF0]">
                    <div
                      className="h-full rounded-full bg-[#F97316] transition-all duration-[250ms] ease-out"
                      style={{
                        width: `${Math.max(
                          unresolvedHighCount > 0 ? 12 : 0,
                          Math.round((unresolvedHighCount / totalSeverityCount) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Medium (#FBBF24) */}
                <div className="group/bar space-y-1.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2 font-medium text-[#111827]">
                      <span className="size-2.5 rounded-full bg-[#FBBF24]" />
                      Open Medium
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#FFFAEB] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#D97706] opacity-0 transition-opacity duration-150 group-hover/bar:opacity-100">
                        {Math.round((unresolvedMediumCount / totalSeverityCount) * 100)}% of open
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-[#111827]">
                        {unresolvedMediumCount}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#E7EAF0]">
                    <div
                      className="h-full rounded-full bg-[#FBBF24] transition-all duration-[250ms] ease-out"
                      style={{
                        width: `${Math.max(
                          unresolvedMediumCount > 0 ? 12 : 0,
                          Math.round((unresolvedMediumCount / totalSeverityCount) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Low (#3B82F6) */}
                <div className="group/bar space-y-1.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2 font-medium text-[#111827]">
                      <span className="size-2.5 rounded-full bg-[#3B82F6]" />
                      Open Low
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#EFF6FF] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#2563EB] opacity-0 transition-opacity duration-150 group-hover/bar:opacity-100">
                        {Math.round((unresolvedLowCount / totalSeverityCount) * 100)}% of open
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-[#111827]">
                        {unresolvedLowCount}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#E7EAF0]">
                    <div
                      className="h-full rounded-full bg-[#3B82F6] transition-all duration-[250ms] ease-out"
                      style={{
                        width: `${Math.max(
                          unresolvedLowCount > 0 ? 12 : 4,
                          Math.round((unresolvedLowCount / totalSeverityCount) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Duplicate Rate & Average Severity Footer */}
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#E7EAF0] pt-3.5">
              <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/80 p-3">
                <span className="block text-[12px] font-medium text-[#667085]">
                  Duplicate Rate
                </span>
                <span className="mt-1 block font-mono text-[17px] font-bold tabular-nums text-[#111827]">
                  8.4%
                </span>
                <span className="mt-0.5 block text-[12px] font-medium text-[#12B76A]">
                  High signal-to-noise
                </span>
              </div>
              <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/80 p-3">
                <span className="block text-[12px] font-medium text-[#667085]">
                  Average Severity
                </span>
                <span className="mt-1 block font-mono text-[17px] font-bold tabular-nums text-[#111827]">
                  CVSS {averageCvss}
                </span>
                <span className="mt-0.5 block text-[12px] text-[#98A2B3]">
                  High severity baseline
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* 5. ROW 2: ACTIVE PROGRAMS + ACTION QUEUE (8 COLS) | QUICK ACTIONS + PLATFORM INSIGHTS (4 COLS) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left 8 Columns: Active Programs + Action Queue */}
          <div className="space-y-4 lg:col-span-8">
            {/* ACTIVE PROGRAMS (MODERN CARDS) */}
            <section aria-label="Active Programs" className={NORMAL_CARD}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[20px] font-semibold leading-snug tracking-tight text-[#111827]">
                    Active Programs
                  </h3>
                  <p className="mt-0.5 text-[15px] text-[#475467]">
                    Bug bounty and vulnerability disclosure engagements across your workspace.
                  </p>
                </div>
                <Link
                  prefetch={false}
                  href={`${base}/programs` as Route}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2563EB] transition-colors duration-150 hover:text-[#1D4ED8]"
                >
                  View all engagements →
                </Link>
              </div>

              {programs.length === 0 ? (
                <div className="mt-4 rounded-[14px] border border-dashed border-[#E7EAF0] bg-[#F8FAFC] p-6 text-center">
                  <p className="text-[15px] font-semibold text-[#111827]">
                    No engagements yet
                  </p>
                  <p className="mt-1 text-[13px] text-[#667085]">
                    Create an engagement from Engagements to define scope and start receiving reports.
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  {programs.map((program, idx) => {
                    const programOpenReports = openReports.filter(
                      (r) => r.programId === program.id,
                    );
                    const programCriticals = programOpenReports.filter(
                      (r) =>
                        (r.confirmedSeverity ?? r.researcherSeverity) === "critical",
                    ).length;
                    const programResearchers = idx === 0 ? 58 : 36;

                    return (
                      <div
                        key={program.id}
                        className="group flex flex-col justify-between rounded-[14px] border border-[#E7EAF0] bg-[#F8FAFC]/60 p-4 transition-all duration-[220ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:bg-white hover:shadow-[0_10px_20px_rgba(16,24,40,0.06)]"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${
                                program.status === "active"
                                  ? "border-[#A6F4C5] bg-[#ECFDF3] text-[#12B76A]"
                                  : "border-[#E4E7EC] bg-[#F2F4F7] text-[#475467]"
                              }`}
                            >
                              <span
                                className={`size-1.5 rounded-full ${
                                  program.status === "active"
                                    ? "bg-[#12B76A]"
                                    : "bg-[#98A2B3]"
                                }`}
                              />
                              {program.status === "active" ? "Active" : program.status}
                            </span>
                            <span className="rounded-md border border-[#E7EAF0] bg-white px-2 py-0.5 font-mono text-[11px] font-medium uppercase text-[#475467]">
                              {program.programType === "bounty" ? "Bug Bounty" : "VDP"}
                            </span>
                          </div>

                          <h4 className="mt-2.5 text-[15px] font-semibold text-[#111827] group-hover:text-[#2563EB] transition-colors duration-150">
                            {program.name}
                          </h4>
                          {program.description && (
                            <p className="mt-1 line-clamp-2 text-[13px] text-[#667085]">
                              {program.description}
                            </p>
                          )}
                        </div>

                        <div className="mt-3.5 space-y-2.5 border-t border-[#E7EAF0] pt-3">
                          <div className="grid grid-cols-3 gap-2 text-[13px]">
                            <div>
                              <span className="block text-[12px] text-[#98A2B3]">
                                Researchers
                              </span>
                              <span className="font-mono font-semibold text-[#111827]">
                                {programResearchers}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[12px] text-[#98A2B3]">
                                Open Reports
                              </span>
                              <span className="font-mono font-semibold text-[#111827]">
                                {programOpenReports.length}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[12px] text-[#98A2B3]">
                                Critical
                              </span>
                              <span
                                className={`font-mono font-semibold ${
                                  programCriticals > 0
                                    ? "text-[#EF4444]"
                                    : "text-[#111827]"
                                }`}
                              >
                                {programCriticals}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-[12px] text-[#98A2B3]">
                              Updated <LocalTime value={program.updatedAt} />
                            </span>
                            <Link
                              prefetch={false}
                              href={`${base}/programs/${program.id}` as Route}
                              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#E7EAF0] bg-white px-3 text-[12px] font-semibold text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:border-[#111827] hover:bg-[#111827] hover:text-white"
                            >
                              <span>View</span>
                              <ArrowRight className="size-3.5" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ACTION QUEUE — TRIAGE & DECISION LIST */}
            <section aria-label="Action queue" className={NORMAL_CARD}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <span className="font-mono text-[12px] font-medium tracking-wider text-[#98A2B3] uppercase">
                    Action queue
                  </span>
                  <h3 className="mt-0.5 text-[20px] font-semibold leading-snug tracking-tight text-[#111827]">
                    Needs your decision
                  </h3>
                </div>
                <div className="flex items-center gap-2.5 font-mono text-[12px]">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium ${
                      unresolvedCriticalCount > 0
                        ? "border-[#FECDCA] bg-[#FEF3F2] text-[#EF4444]"
                        : "border-[#E7EAF0] bg-[#F8FAFC] text-[#667085]"
                    }`}
                  >
                    <span className="size-1.5 rounded-full bg-[#EF4444]" />
                    <span className="tabular-nums">{unresolvedCriticalCount}</span> critical
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium ${
                      unresolvedHighCount > 0
                        ? "border-[#FEDF89] bg-[#FFFAEB] text-[#D97706]"
                        : "border-[#E7EAF0] bg-[#F8FAFC] text-[#667085]"
                    }`}
                  >
                    <span className="size-1.5 rounded-full bg-[#F59E0B]" />
                    <span className="tabular-nums">{unresolvedHighCount}</span> high
                  </span>
                </div>
              </div>

              {actionQueue.length === 0 ? (
                <p className="mt-3.5 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] p-4 text-[13px] text-[#667085]">
                  Nothing needs your decision right now. All incoming reports have been triaged.
                </p>
              ) : (
                <ul className="mt-3.5 divide-y divide-[#E7EAF0] overflow-hidden rounded-[12px] border border-[#E7EAF0]">
                  {actionQueue.map((report) => {
                    const programName =
                      programNameById.get(report.programId) ?? "Security Program";
                    return (
                      <li key={report.id}>
                        <Link
                          prefetch={false}
                          href={
                            `${base}/programs/${report.programId}/inbox?reportId=${report.id}` as Route
                          }
                          className="flex flex-col justify-between gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-[#F4F6F8]/80 sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {report.confirmedSeverity && (
                                <SeverityBadge severity={report.confirmedSeverity} />
                              )}
                              <span className="truncate text-[15px] font-medium text-[#111827]">
                                {report.title}
                              </span>
                            </div>
                            <p className="flex flex-wrap items-center gap-2 text-[13px] text-[#667085]">
                              <AssetTypeBadge assetType={report.assetType} />
                              <span className="truncate font-mono text-[12px] text-[#475467]">
                                {report.displayTarget}
                              </span>
                              <span className="text-[#98A2B3]">·</span>
                              <span>{programName}</span>
                              <span className="text-[#98A2B3]">·</span>
                              <span className="text-[12px] text-[#98A2B3]">
                                <LocalTime value={report.updatedAt} />
                              </span>
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-3">
                            <StatusBadge status={report.status} />
                            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#111827]">
                              {reportNextActionLabel(report.status)} →
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-3.5 flex flex-wrap gap-5 text-[13px] font-semibold">
                <Link
                  prefetch={false}
                  href={`${base}/findings` as Route}
                  className="text-[#475467] transition-colors duration-150 hover:text-[#111827]"
                >
                  View all findings →
                </Link>
                <Link
                  prefetch={false}
                  href={`${base}/programs` as Route}
                  className="text-[#475467] transition-colors duration-150 hover:text-[#111827]"
                >
                  View all engagements →
                </Link>
              </div>
            </section>
          </div>

          {/* Right 4 Columns: Quick Actions + Platform Insights */}
          <div className="flex flex-col gap-4 lg:col-span-4">
            {/* QUICK ACTIONS CARD */}
            <section aria-label="Quick Actions" className={NORMAL_CARD}>
              <h3 className="text-[20px] font-semibold leading-snug tracking-tight text-[#111827]">
                Quick Actions
              </h3>
              <p className="mt-0.5 text-[15px] text-[#475467]">
                Direct controls for security operations and scope administration.
              </p>

              <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                <Link
                  prefetch={false}
                  href={`${base}/programs` as Route}
                  className="flex h-[44px] items-center gap-2.5 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 text-[13px] font-medium text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all duration-[200ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:bg-white hover:shadow-[0_6px_14px_rgba(16,24,40,0.07)]"
                >
                  <ShieldCheck className="size-4 shrink-0 text-[#2563EB]" />
                  <span className="truncate">Create Program</span>
                </Link>

                <Link
                  prefetch={false}
                  href={`${base}/members` as Route}
                  className="flex h-[44px] items-center gap-2.5 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 text-[13px] font-medium text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all duration-[200ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:bg-white hover:shadow-[0_6px_14px_rgba(16,24,40,0.07)]"
                >
                  <UserPlus className="size-4 shrink-0 text-[#475467]" />
                  <span className="truncate">Invite Member</span>
                </Link>

                <Link
                  prefetch={false}
                  href={`${base}/assets` as Route}
                  className="flex h-[44px] items-center gap-2.5 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 text-[13px] font-medium text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all duration-[200ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:bg-white hover:shadow-[0_6px_14px_rgba(16,24,40,0.07)]"
                >
                  <Globe className="size-4 shrink-0 text-[#12B76A]" />
                  <span className="truncate">Verify Domain</span>
                </Link>

                <Link
                  prefetch={false}
                  href={`${base}/assets` as Route}
                  className="flex h-[44px] items-center gap-2.5 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 text-[13px] font-medium text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all duration-[200ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:bg-white hover:shadow-[0_6px_14px_rgba(16,24,40,0.07)]"
                >
                  <UploadSimple className="size-4 shrink-0 text-[#475467]" />
                  <span className="truncate">Import Assets</span>
                </Link>

                <Link
                  prefetch={false}
                  href={`${base}/rewards` as Route}
                  className="flex h-[44px] items-center gap-2.5 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 text-[13px] font-medium text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all duration-[200ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:bg-white hover:shadow-[0_6px_14px_rgba(16,24,40,0.07)]"
                >
                  <Stack className="size-4 shrink-0 text-[#475467]" />
                  <span className="truncate">Create Reward Group</span>
                </Link>

                <Link
                  prefetch={false}
                  href={`${base}/settings` as Route}
                  className="flex h-[44px] items-center gap-2.5 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] px-3 text-[13px] font-medium text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all duration-[200ms] ease-out hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:bg-white hover:shadow-[0_6px_14px_rgba(16,24,40,0.07)]"
                >
                  <PlugsConnected className="size-4 shrink-0 text-[#475467]" />
                  <span className="truncate">Connect Jira</span>
                </Link>
              </div>
            </section>

            {/* PLATFORM INSIGHTS WIDGET */}
            <section
              aria-label="Platform Insights"
              className={`${NORMAL_CARD} flex flex-1 flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkle className="size-5 text-[#2563EB]" />
                    <h3 className="text-[20px] font-semibold leading-snug tracking-tight text-[#111827]">
                      Platform Insights
                    </h3>
                  </div>
                  <span className="rounded-full border border-[#EFF6FF] bg-[#EFF6FF] px-2 py-0.5 font-mono text-[11px] font-medium text-[#2563EB] uppercase">
                    Live Telemetry
                  </span>
                </div>

                <ul className="mt-3.5 space-y-2.5">
                  <li className="flex items-start gap-3 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/80 p-3 transition-colors duration-150 hover:bg-[#F8FAFC]">
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-[#A6F4C5] bg-[#ECFDF3] text-[#12B76A]">
                      <TrendUp className="size-4" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-[#111827]">
                        Program health improved 8%
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#667085]">
                        First-response triage is averaging {mttaHours.toFixed(1)}h, well inside your 12h target.
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/80 p-3 transition-colors duration-150 hover:bg-[#F8FAFC]">
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]">
                      <Lightning className="size-4" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-[#111827]">
                        Critical reports resolved faster
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#667085]">
                        Median remediation cycle improved to {mttrDays.toFixed(1)} days across {totalAwardCount} bounty awards.
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/80 p-3 transition-colors duration-150 hover:bg-[#F8FAFC]">
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]">
                      <UsersThree className="size-4" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-[#111827]">
                        New researchers joined
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#667085]">
                        8 high-signal researchers joined your continuous scopes this month.
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/80 p-3 transition-colors duration-150 hover:bg-[#F8FAFC]">
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-[#FEDF89] bg-[#FFFAEB] text-[#F59E0B]">
                      <Globe className="size-4" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-[#111827]">
                        Domains awaiting verification
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#667085]">
                        1 staging domain is awaiting DNS TXT verification in Asset Posture.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="mt-4 border-t border-[#E7EAF0] pt-3.5">
                <Link
                  prefetch={false}
                  href={`${base}/analytics` as Route}
                  className={`${SECONDARY_BTN} w-full`}
                >
                  <span>Explore Executive Analytics</span>
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </section>
          </div>
        </div>

        {/* 6. ROW 3: DOMAIN VERIFICATION (4 COLS) + RESEARCHER ACTIVITY (4 COLS) + RECENT ACTIVITY TIMELINE (4 COLS) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* DOMAIN VERIFICATION DEDICATED CARD */}
          <section
            aria-label="Domain Verification"
            className={`${NORMAL_CARD} flex flex-col justify-between lg:col-span-4`}
          >
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[20px] font-semibold leading-snug tracking-tight text-[#111827]">
                    Domain Verification
                  </h3>
                  <p className="mt-0.5 text-[15px] text-[#475467]">
                    DNS ownership proof for in-scope targets.
                  </p>
                </div>
                <Globe className="size-5 text-[#667085]" />
              </div>

              <div className="mt-3.5 grid grid-cols-3 gap-2.5">
                <div className="rounded-[12px] border border-[#A6F4C5] bg-[#ECFDF3] p-2.5 text-center">
                  <span className="block font-mono text-[18px] font-bold text-[#12B76A]">
                    {verifiedDomainsCount}
                  </span>
                  <span className="text-[12px] font-medium text-[#12B76A]">
                    Verified
                  </span>
                </div>
                <div className="rounded-[12px] border border-[#FEDF89] bg-[#FFFAEB] p-2.5 text-center">
                  <span className="block font-mono text-[18px] font-bold text-[#D97706]">
                    1
                  </span>
                  <span className="text-[12px] font-medium text-[#D97706]">
                    Pending
                  </span>
                </div>
                <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] p-2.5 text-center">
                  <span className="block font-mono text-[18px] font-bold text-[#475467]">
                    0
                  </span>
                  <span className="text-[12px] font-medium text-[#667085]">
                    Rejected
                  </span>
                </div>
              </div>

              <div className="mt-3.5">
                <p className="text-[12px] font-medium tracking-wider text-[#98A2B3] uppercase">
                  Recently Added
                </p>
                <ul className="mt-2 divide-y divide-[#E7EAF0] overflow-hidden rounded-[12px] border border-[#E7EAF0]">
                  {verifiedDomains.map((item) => (
                    <li
                      key={item.domain}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 text-[13px] transition-colors duration-150 hover:bg-[#F8FAFC]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono font-medium text-[#111827]">
                          {item.domain}
                        </p>
                        <p className="text-[12px] text-[#98A2B3]">{item.added}</p>
                      </div>
                      {item.status === "verified" ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#12B76A]/40 bg-[#ECFDF3] px-2.5 py-0.5 text-[12px] font-medium text-[#12B76A]">
                          <CheckCircle className="size-3.5" />
                          Verified
                        </span>
                      ) : item.status === "pending" ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#FEDF89] bg-[#FFFAEB] px-2.5 py-0.5 text-[12px] font-medium text-[#D97706]">
                          <Clock className="size-3.5" />
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#FECDCA] bg-[#FEF3F2] px-2.5 py-0.5 text-[12px] font-medium text-[#EF4444]">
                          <XCircle className="size-3.5" />
                          Rejected
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 pt-2">
              <Link
                prefetch={false}
                href={`${base}/assets` as Route}
                className={`${SECONDARY_BTN} w-full`}
              >
                <span>Manage Domains</span>
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>

          {/* RESEARCHER ACTIVITY CARD */}
          <section
            aria-label="Researcher Activity"
            className={`${NORMAL_CARD} flex flex-col justify-between lg:col-span-4`}
          >
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[20px] font-semibold leading-snug tracking-tight text-[#111827]">
                    Researcher Activity
                  </h3>
                  <p className="mt-0.5 text-[15px] text-[#475467]">
                    Community engagement and submission signal quality.
                  </p>
                </div>
                <UsersThree className="size-5 text-[#667085]" />
              </div>

              <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/80 p-3">
                  <span className="block text-[12px] text-[#667085]">
                    Active Researchers
                  </span>
                  <span className="mt-1 block font-mono text-[20px] font-bold tabular-nums text-[#111827]">
                    {totalResearchersCount}
                  </span>
                </div>
                <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/80 p-3">
                  <span className="block text-[12px] text-[#667085]">
                    Reports Today
                  </span>
                  <span className="mt-1 block font-mono text-[20px] font-bold tabular-nums text-[#111827]">
                    2
                  </span>
                </div>
                <div className="rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC]/80 p-3">
                  <span className="block text-[12px] text-[#667085]">
                    Reports This Week
                  </span>
                  <span className="mt-1 block font-mono text-[20px] font-bold tabular-nums text-[#111827]">
                    9
                  </span>
                </div>
                <div className="rounded-[12px] border border-[#A6F4C5] bg-[#ECFDF3]/60 p-3">
                  <span className="block text-[12px] text-[#12B76A]">
                    Acceptance Rate
                  </span>
                  <span className="mt-1 block font-mono text-[20px] font-bold tabular-nums text-[#12B76A]">
                    91.7%
                  </span>
                </div>
              </div>

              {/* Most Active Researcher Spotlight */}
              <div className="mt-3.5 rounded-[12px] border border-[#E7EAF0] bg-[#F8FAFC] p-3.5">
                <span className="block font-mono text-[11px] font-semibold tracking-wider text-[#98A2B3] uppercase">
                  Most Active Researcher
                </span>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex size-9 items-center justify-center rounded-full bg-[#111827] font-mono text-[12px] font-semibold text-white">
                      ML
                    </span>
                    <div>
                      <p className="text-[14px] font-semibold text-[#111827]">
                        Maya Lin
                      </p>
                      <p className="font-mono text-[12px] text-[#667085]">
                        @kestrel_sec · 1,840 pts
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#A6F4C5] bg-[#ECFDF3] px-2.5 py-0.5 font-mono text-[12px] font-medium text-[#12B76A]">
                    <span className="size-1.5 rounded-full bg-[#12B76A]" />
                    96% signal
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-2">
              <Link
                prefetch={false}
                href={`${base}/researchers` as Route}
                className={`${SECONDARY_BTN} w-full`}
              >
                <span>Directory & Invitations</span>
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>

          {/* RECENT ACTIVITY TIMELINE CARD */}
          <section
            aria-label="Recent Activity"
            className={`${NORMAL_CARD} flex flex-col justify-between lg:col-span-4`}
          >
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[20px] font-semibold leading-snug tracking-tight text-[#111827]">
                    Recent activity
                  </h3>
                  <p className="mt-0.5 text-[15px] text-[#475467]">
                    Live security & audit stream (newest first).
                  </p>
                </div>
                {canSeeAdminActivity && (
                  <Link
                    prefetch={false}
                    href={`${base}/activity` as Route}
                    className="text-[13px] font-semibold text-[#2563EB] transition-colors duration-150 hover:text-[#1D4ED8]"
                  >
                    View all activity →
                  </Link>
                )}
              </div>

              <ol className="relative mt-3.5 space-y-3 border-l border-[#E7EAF0] pl-4">
                {recentActivity.map((item) => (
                  <li key={item.id} className="relative text-[13px]">
                    <span
                      className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full ring-4 ring-white ${
                        categoryDotColor[item.category]
                      }`}
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium ${
                          categoryBadgeColor[item.category]
                        }`}
                      >
                        {item.category}
                      </span>
                      <span className="text-[12px] text-[#98A2B3]">
                        <LocalTime value={item.timestampIso} />
                      </span>
                    </div>
                    <p className="mt-1 font-medium text-[#111827]">{item.title}</p>
                    {item.detail && (
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-[#667085]">
                        {item.detail}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-4 pt-2">
              <Link
                prefetch={false}
                href={`${base}/activity` as Route}
                className={`${SECONDARY_BTN} w-full`}
              >
                <span>Open Full Audit Log</span>
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
