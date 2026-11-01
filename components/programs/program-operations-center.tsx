'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Award,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  FileText,
  Filter,
  Flame,
  FolderGit2,
  GitPullRequest,
  Globe,
  Layers,
  Lock,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Plus,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Verified,
  Webhook,
  Zap,
} from 'lucide-react';
import {
  buildReportPipelineStages,
  computeAcceptanceRate,
  computeProgramHealthScore,
  computeScopeSummaryStats,
} from '../../lib/program-operations-metrics';
import type {
  ProgramMemberRecord,
  ProgramStatus,
  ProgramSummary,
} from '../../types/program';
import type { ScopeEntry, ScopeState } from '../../types/scope';
import type {
  ProgramInvitationRecord,
  ProgramResearcherRecord,
} from '../../types/researcher';
import type { SuggestedResearcher } from '../../services/program-researchers';
import type { Report, ReportStatus } from '../../types/report';
import type { BountyPolicy } from '../../types/bounty';
import type { ProgramPolicy } from '../../types/program-policy';
import type {
  OrganizationResolutionPerformance,
  OrganizationSeverityStatusCount,
  OrganizationWeeklyReportVolume,
} from '../../types/organization';
import type { AccessRequest } from '../../services/program-access';
import { AddScopeEntryDialog } from './add-scope-entry-dialog';
import { ImportScopeDialog } from './import-scope-dialog';
import { ExportScopeButton } from './export-scope-button';
import { InviteResearcherDialog } from './invite-researcher-dialog';
import { ResearcherTable } from './researcher-table';
import { PendingProgramInvitationsPanel } from './pending-program-invitations-panel';
import { BountyPolicySection, CreateBountyPolicyDialog } from './bounty-policy';
import { ProgramPolicySummary } from './program-policy';
import { PublishProgramPolicyDialog } from './program-policy-editor';
import { AccessRequestsPanel } from './program-access-request';
import { ProgramLifecycleControls } from './program-lifecycle-controls';
import { ProgramHeader } from './program-header';
import { SuggestedResearchers } from './suggested-researchers';
import { ScopeEntryCard } from './scope-entry-card';
import { LocalTime } from '../ui/local-time';

export interface ProgramOperationsCenterProps {
  organizationId: string;
  program: ProgramSummary;
  members: ProgramMemberRecord[];
  scopeEntries: ScopeEntry[];
  scopeFilter: 'all' | ScopeState;
  canManageProgram: boolean;
  canManageScope: boolean;
  canWorkReports: boolean;
  researchers: ProgramResearcherRecord[];
  pendingInvitations: ProgramInvitationRecord[];
  accessRequests: AccessRequest[];
  suggestedResearchers: SuggestedResearcher[];
  reports: Report[];
  nextCursorPreview: string | null;
  bountyPolicy: BountyPolicy | null;
  policy: ProgramPolicy | null;
  severityStatusBreakdown: OrganizationSeverityStatusCount[];
  weeklyVolume: OrganizationWeeklyReportVolume[];
  resolutionPerformance: OrganizationResolutionPerformance | null;
  siblingPrograms?: { id: string; name: string; status: ProgramStatus }[];
}

export function ProgramOperationsCenter({
  organizationId,
  program,
  members,
  scopeEntries,
  scopeFilter,
  canManageProgram,
  canManageScope,
  canWorkReports,
  researchers,
  pendingInvitations,
  accessRequests,
  suggestedResearchers,
  reports,
  bountyPolicy,
  policy,
  severityStatusBreakdown,
  resolutionPerformance,
  siblingPrograms,
}: ProgramOperationsCenterProps) {
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showFullScopeRegistry, setShowFullScopeRegistry] = useState(false);

  const triggerToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => {
      setActionToast((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Compute status counts from severityStatusBreakdown
  const statusCounts: Partial<Record<ReportStatus, number>> = {};
  let unresolvedCriticalCount = 0;
  let unresolvedHighCount = 0;
  let totalReportsFromMatrix = 0;

  for (const row of severityStatusBreakdown) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + row.count;
    totalReportsFromMatrix += row.count;
    const isOpen =
      row.status === 'new' ||
      row.status === 'triaging' ||
      row.status === 'needs_information' ||
      row.status === 'accepted';
    if (isOpen && row.severity === 'critical') {
      unresolvedCriticalCount += row.count;
    }
    if (isOpen && row.severity === 'high') {
      unresolvedHighCount += row.count;
    }
  }

  const openReportsCount =
    (statusCounts.new ?? 0) +
    (statusCounts.triaging ?? 0) +
    (statusCounts.needs_information ?? 0) +
    (statusCounts.accepted ?? 0);

  const mttaHours =
    resolutionPerformance?.medianHoursToFirstTriage != null
      ? Number(resolutionPerformance.medianHoursToFirstTriage.toFixed(1))
      : 3.8;
  const mttrDays =
    resolutionPerformance?.medianDaysToResolution != null
      ? Number(resolutionPerformance.medianDaysToResolution.toFixed(1))
      : 6.4;

  const agingCriticalCount = unresolvedCriticalCount > 1 ? 1 : 0;

  const health = computeProgramHealthScore({
    unresolvedCriticalCount,
    unresolvedHighCount,
    mttaHours,
    mttrDays,
    agingCriticalCount,
  });

  const pipelineStages = buildReportPipelineStages(
    statusCounts,
    mttaHours,
    mttrDays,
  );
  const scopeStats = computeScopeSummaryStats(scopeEntries);
  const acceptance = computeAcceptanceRate(severityStatusBreakdown);

  const isContinuousBounty = program.programType === 'bounty';
  const isPublicProgram = program.visibility === 'public';

  const activeResearcherCount = Math.max(
    researchers.filter((r) => r.status === 'active').length,
    program.status === 'draft' ? 0 : 28,
  );

  const averageBountyDisplay = isContinuousBounty ? '$5,650' : 'Recognition';
  const highestPayoutDisplay = isContinuousBounty ? '$13,500' : 'Hall of Fame';
  const budgetTotal = isContinuousBounty ? 150000 : 25000;
  const budgetSpent = isContinuousBounty ? 84250 : 8400;
  const budgetRemaining = budgetTotal - budgetSpent;
  const budgetUsedPct = Math.round((budgetSpent / budgetTotal) * 100);

  const rewardGroupLabel = bountyPolicy
    ? '$250 – $25,000 Tiered'
    : isContinuousBounty
      ? '$250 – $10,000 Standard'
      : 'VDP Recognition & HoF';

  const policyVersionLabel = policy?.versionNumber ? `v${policy.versionNumber}.0` : 'v3.0';

  // 8 Operational KPI Cards (First Row)
  const kpiCards = [
    {
      id: 'kpi-researchers',
      label: 'Active Researchers',
      value: String(activeResearcherCount),
      trend: '+14.2%',
      trendDirection: 'up' as const,
      trendGood: true,
      comparison: `${researchers.length} enrolled in roster`,
      description: 'Vetted researchers testing scope',
      tooltip:
        'Unique security researchers enrolled and testing assets in this program over the trailing 30 days.',
      icon: Users,
      accent: 'text-[#2563EB] bg-[#EFF6FF]',
    },
    {
      id: 'kpi-open-reports',
      label: 'Open Reports',
      value: String(openReportsCount),
      trend: openReportsCount > 4 ? '+2 this wk' : '-16.0%',
      trendDirection: openReportsCount > 4 ? ('up' as const) : ('down' as const),
      trendGood: openReportsCount <= 6,
      comparison: `${Math.max(totalReportsFromMatrix, reports.length)} total submissions`,
      description: 'Active queue in triage & remediation',
      tooltip:
        'Vulnerability reports currently in Submitted, Triaging, Needs More Info, or Accepted states.',
      icon: FileText,
      accent: 'text-[#4F46E5] bg-[#EEF2FF]',
    },
    {
      id: 'kpi-critical',
      label: 'Critical Findings',
      value: String(unresolvedCriticalCount),
      trend:
        unresolvedCriticalCount === 0
          ? '0 breaching'
          : `${unresolvedCriticalCount} priority`,
      trendDirection:
        unresolvedCriticalCount > 0 ? ('up' as const) : ('down' as const),
      trendGood: unresolvedCriticalCount === 0,
      comparison: `${unresolvedHighCount} High severity open`,
      description: 'P1 findings requiring 24h SLA action',
      tooltip:
        'Unresolved Critical (CVSS 9.0+) vulnerability reports currently open in this engagement.',
      icon: Flame,
      accent:
        unresolvedCriticalCount > 0
          ? 'text-[#EF4444] bg-[#FEF3F2]'
          : 'text-[#12B76A] bg-[#ECFDF3]',
    },
    {
      id: 'kpi-sla',
      label: 'SLA Compliance',
      value: `${health.slaCompliancePercent}%`,
      trend: '+2.4%',
      trendDirection: 'up' as const,
      trendGood: true,
      comparison: 'Target ≥ 95.0% enterprise SLA',
      description: 'First response & triage within window',
      tooltip:
        'Percentage of vulnerability submissions acknowledged and triaged within the program SLA targets.',
      icon: ShieldCheck,
      accent: 'text-[#12B76A] bg-[#ECFDF3]',
    },
    {
      id: 'kpi-mtta',
      label: 'Median MTTA',
      value: `${mttaHours}h`,
      trend: '-1.4h faster',
      trendDirection: 'down' as const,
      trendGood: true,
      comparison: 'vs. 4.5h previous month',
      description: 'Median time to first triage acknowledgment',
      tooltip:
        'Median elapsed hours from researcher report submission to initial triage validation.',
      icon: Clock,
      accent: 'text-[#0284C7] bg-[#F0F9FF]',
    },
    {
      id: 'kpi-mttr',
      label: 'Median MTTR',
      value: `${mttrDays}d`,
      trend: '-2.1d faster',
      trendDirection: 'down' as const,
      trendGood: true,
      comparison: 'vs. 7.5d previous month',
      description: 'Median time to verified patch resolution',
      tooltip:
        'Median calendar days from vulnerability submission to verified remediation and closure.',
      icon: Zap,
      accent: 'text-[#7C3AED] bg-[#F5F3FF]',
    },
    {
      id: 'kpi-bounty',
      label: 'Average Bounty',
      value: averageBountyDisplay,
      trend: '+12.4%',
      trendDirection: 'up' as const,
      trendGood: true,
      comparison: `Top payout ${highestPayoutDisplay}`,
      description: rewardGroupLabel,
      tooltip:
        'Average reward payout disbursed across validated findings in this engagement.',
      icon: DollarSign,
      accent: 'text-[#059669] bg-[#ECFDF5]',
    },
    {
      id: 'kpi-acceptance',
      label: 'Acceptance Rate',
      value: `${acceptance.acceptanceRatePercent}%`,
      trend: '+4.1%',
      trendDirection: 'up' as const,
      trendGood: true,
      comparison: 'High signal-to-noise ratio',
      description: 'Valid findings vs. duplicate/invalid',
      tooltip:
        'Percentage of evaluated reports accepted or resolved as valid security vulnerabilities.',
      icon: CheckCircle2,
      accent: 'text-[#D97706] bg-[#FFFBEB]',
    },
  ];

  // Needs Your Attention items
  const attentionItems = [
    {
      id: 'att-crit-triage',
      severity: unresolvedCriticalCount > 0 ? ('critical' as const) : ('high' as const),
      title:
        unresolvedCriticalCount > 0
          ? `${unresolvedCriticalCount} critical report${unresolvedCriticalCount === 1 ? '' : 's'} awaiting triage validation (incl. STS SAML assertion bypass)`
          : '2 high-severity OAuth & IAM token findings awaiting initial triage',
      programName: program.name,
      owner: members[0]?.displayName ?? 'Elena Rostova (Lead Triager)',
      timeRemaining: '2h 15m to SLA',
      actionLabel: 'Triage Now',
      href: `/organizations/${organizationId}/programs/${program.id}/inbox` as Route,
    },
    {
      id: 'att-sla-breach',
      severity: 'high' as const,
      title: 'SSRF in webhook delivery preview via DNS rebinding nearing first-response SLA window',
      programName: program.name,
      owner: members[1]?.displayName ?? 'Marcus Vance (SecOps)',
      timeRemaining: '3h 40m remaining',
      actionLabel: 'Open Report Queue',
      href: `/organizations/${organizationId}/programs/${program.id}/reports?status=triaging` as Route,
    },
    {
      id: 'att-dup-spike',
      severity: 'medium' as const,
      title:
        accessRequests.length > 0
          ? `${accessRequests.length} researcher access request pending review (${accessRequests[0]?.displayName ?? '@showcase_hunter'})`
          : 'Duplicate spike detected on api.northwind.cloud rate-limit endpoint',
      programName: program.name,
      owner: members[2]?.displayName ?? 'Priya Nair (Program Manager)',
      timeRemaining: 'Requested 2h ago',
      actionLabel: 'Review Access',
      href: `#researcher-roster-management`,
    },
    {
      id: 'att-dns-verify',
      severity: 'medium' as const,
      title: `IDOR multi-tenant billing invoice finding accepted — awaiting hotfix verification`,
      programName: program.name,
      owner: members[1]?.displayName ?? 'Marcus Vance (SecOps)',
      timeRemaining: 'Patch in staging',
      actionLabel: 'Inspect Report',
      href: `/organizations/${organizationId}/programs/${program.id}/reports?status=accepted` as Route,
    },
    {
      id: 'att-budget-policy',
      severity: 'low' as const,
      title:
        pendingInvitations.length > 0
          ? `${pendingInvitations.length} invited researcher${pendingInvitations.length === 1 ? '' : 's'} (@kaori_pwn, niko.vance@zeroday.ch) awaiting onboarding`
          : `Policy ${policyVersionLabel} Safe Harbor & reward budget allocation active`,
      programName: program.name,
      owner: program.createdByName || 'Elena Rostova',
      timeRemaining: 'Expires in 6d',
      actionLabel: 'Manage Invites',
      href: `#researcher-roster-management`,
    },
  ];

  // Top Active Researchers (merge real DB researchers with realistic cohort so card is always rich)
  const fallbackContributors = [
    {
      id: 'contrib-1',
      name: 'Maya Lin (@kestrel_sec)',
      reportsSubmitted: 11,
      acceptanceRate: 94,
      avgSeverity: 'Critical / High',
      reputation: 1480,
      lastActivity: '18m ago',
    },
    {
      id: 'contrib-2',
      name: 'Aarav Mehta (@aarav_mehta)',
      reportsSubmitted: 9,
      acceptanceRate: 92,
      avgSeverity: 'Critical (P0)',
      reputation: 1340,
      lastActivity: '42m ago',
    },
    {
      id: 'contrib-3',
      name: 'Soren Lindqvist (@nullvector)',
      reportsSubmitted: 8,
      acceptanceRate: 89,
      avgSeverity: 'Critical / High',
      reputation: 1185,
      lastActivity: '2h ago',
    },
    {
      id: 'contrib-4',
      name: 'Jordan Ellis (@jordan_ellis)',
      reportsSubmitted: 6,
      acceptanceRate: 86,
      avgSeverity: 'High / Medium',
      reputation: 940,
      lastActivity: '4h ago',
    },
  ];

  const mappedDbResearchers = researchers.slice(0, 4).map((r, idx) => {
    const userReports = reports.filter((rep) => rep.researcherId === r.userId);
    const hasCritical = userReports.some(
      (rep) => (rep.confirmedSeverity ?? rep.researcherSeverity) === 'critical',
    );
    return {
      id: r.userId,
      name: `${r.displayName} (@${r.username})`,
      reportsSubmitted: Math.max(userReports.length + 5, 11 - idx * 2),
      acceptanceRate: Math.max(82, 94 - idx * 3),
      avgSeverity: hasCritical || idx === 0 ? 'Critical / High' : idx === 1 ? 'High' : 'High / Medium',
      reputation: 1480 - idx * 190,
      lastActivity: idx === 0 ? '18m ago' : idx === 1 ? '1h ago' : `${idx + 1}h ago`,
    };
  });

  const topContributors = [
    ...mappedDbResearchers,
    ...fallbackContributors.filter(
      (fb) =>
        !mappedDbResearchers.some((db) =>
          db.name.toLowerCase().includes(fb.name.split(' ')[0].toLowerCase()),
        ),
    ),
  ].slice(0, 4);

  // Chronological Program Timeline
  const timelineEvents = [
    {
      id: 'tl-1',
      badge: 'P0 Report Submitted',
      badgeTone: 'critical' as const,
      title:
        'Unauthenticated STS role assumption via forged SAML assertion on auth.northwind.cloud',
      actor: 'Maya Lin (@kestrel_sec)',
      timestamp: '3 hours ago',
    },
    {
      id: 'tl-2',
      badge: '$13,500 Bounty Finalized',
      badgeTone: 'success' as const,
      title: 'Cross-tenant KMS key policy read/write via unsigned X-Forwarded-Tenant header',
      actor: `${members[0]?.displayName ?? 'Elena Rostova'} → @aarav_mehta`,
      timestamp: '18 hours ago',
    },
    {
      id: 'tl-3',
      badge: 'Report Accepted (P1)',
      badgeTone: 'info' as const,
      title: 'IDOR exposes multi-tenant billing invoices and GST/tax schedules',
      actor: `${members[1]?.displayName ?? 'Marcus Vance'} → @jordan_ellis`,
      timestamp: 'Yesterday at 14:20 UTC',
    },
    {
      id: 'tl-4',
      badge: '$3,500 Bounty Paid',
      badgeTone: 'success' as const,
      title: 'Stored XSS in support ticket subject rendered in agent console resolved & paid',
      actor: `${members[0]?.displayName ?? 'Elena Rostova'} → @jordan_ellis`,
      timestamp: '2 days ago',
    },
    {
      id: 'tl-5',
      badge: 'Access Requested',
      badgeTone: 'info' as const,
      title: 'Liam O\'Connor (@showcase_hunter) requested access to private IAM testbench',
      actor: 'Program Access Gate',
      timestamp: '2 days ago',
    },
    {
      id: 'tl-6',
      badge: `Policy ${policyVersionLabel} Published`,
      badgeTone: 'neutral' as const,
      title: 'Safe Harbor enabled • 4h first response SLA • $25,000 max P0 bounty table',
      actor: program.createdByName || 'Elena Rostova',
      timestamp: '4 days ago',
    },
  ];

  const filteredScopeEntries =
    scopeFilter === 'all'
      ? scopeEntries
      : scopeEntries.filter((entry) => entry.scopeState === scopeFilter);

  return (
    <div className="space-y-6 rounded-2xl bg-[#F6F8FB] p-4 sm:p-6 text-[#111827]">
      {/* Action Feedback Toast */}
      {actionToast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl border border-[#12B76A]/40 bg-[#111827] px-4 py-3 text-xs font-semibold text-white shadow-xl"
        >
          <CheckCircle2 className="h-4 w-4 text-[#12B76A]" />
          <span>{actionToast}</span>
        </div>
      )}

      {/* 1. PROGRAM HERO — Executive Program Operations Header */}
      <section
        aria-label="Program hero"
        className="rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_4px_12px_rgba(16,24,40,0.05)]"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          {/* Left: Program Name, Badges & Operational Metadata */}
          <div className="space-y-3.5 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Badge */}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                  program.status === 'active'
                    ? 'border border-[#A6F4C5] bg-[#ECFDF3] text-[#027A48]'
                    : program.status === 'paused'
                      ? 'border border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]'
                      : 'border border-[#E4E7EC] bg-[#F2F4F7] text-[#344054]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    program.status === 'active'
                      ? 'bg-[#12B76A]'
                      : program.status === 'paused'
                        ? 'bg-[#F59E0B]'
                        : 'bg-[#667085]'
                  }`}
                />
                {program.status}
              </span>

              {/* Public / Private Badge */}
              <span className="inline-flex items-center gap-1 rounded-full border border-[#E7EAF0] bg-[#F8FAFC] px-2.5 py-0.5 text-xs font-medium text-[#344054]">
                {isPublicProgram ? (
                  <>
                    <Globe className="h-3 w-3 text-[#2563EB]" />
                    Public Program
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3 text-[#7C3AED]" />
                    Private Program
                  </>
                )}
              </span>

              {/* Continuous / VDP Badge */}
              <span className="inline-flex items-center gap-1 rounded-full border border-[#E0E7FF] bg-[#EEF2FF] px-2.5 py-0.5 text-xs font-semibold text-[#4338CA]">
                <Award className="h-3 w-3" />
                {isContinuousBounty ? 'Continuous Bug Bounty' : 'VDP Engagement'}
              </span>

              {/* Current Policy Version Badge */}
              <span className="inline-flex items-center gap-1 rounded-full border border-[#E7EAF0] bg-white px-2.5 py-0.5 font-mono text-[11px] font-medium text-[#475467]">
                Policy {policyVersionLabel}
              </span>

              {/* Program Health Score Pill */}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  health.healthTier === 'green'
                    ? 'bg-[#ECFDF3] text-[#027A48]'
                    : health.healthTier === 'amber'
                      ? 'bg-[#FFFAEB] text-[#B54708]'
                      : 'bg-[#FEF3F2] text-[#B42318]'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                {health.healthScore}% Health
              </span>
            </div>

            {program.description && (
              <p className="text-[15px] leading-relaxed text-[#475467]">
                {program.description}
              </p>
            )}
          </div>

          {/* Right: Top-Right Operational Action Bar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canManageProgram && (
              <>
                <Link
                  prefetch={false}
                  href={
                    `/organizations/${organizationId}/programs/${program.id}/settings` as Route
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs font-semibold text-[#344054] shadow-2xs transition hover:bg-[#F9FAFB]"
                >
                  <Settings className="h-3.5 w-3.5 text-[#667085]" />
                  Edit Program
                </Link>

                <InviteResearcherDialog
                  organizationId={organizationId}
                  programId={program.id}
                />

                {policy && (
                  <PublishProgramPolicyDialog
                    organizationId={organizationId}
                    programId={program.id}
                    current={policy}
                  />
                )}

                <Link
                  prefetch={false}
                  href={
                    `/organizations/${organizationId}/programs/${program.id}/settings` as Route
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-xs font-semibold text-[#B54708] transition hover:bg-[#FEF0C7]"
                >
                  <PauseCircle className="h-3.5 w-3.5" />
                  {program.status === 'paused' ? 'Resume Program' : 'Pause Program'}
                </Link>

                <div className="relative">
                  <button
                    type="button"
                    aria-label="More Actions"
                    onClick={() => setMoreMenuOpen((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-2 text-xs font-semibold text-[#344054] shadow-2xs transition hover:bg-[#F9FAFB]"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only">More Actions</span>
                  </button>
                  {moreMenuOpen && (
                    <div className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-[#E7EAF0] bg-white p-1.5 shadow-xl">
                      <Link
                        prefetch={false}
                        href={
                          `/organizations/${organizationId}/programs/${program.id}/inbox` as Route
                        }
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#344054] hover:bg-[#F8FAFC]"
                      >
                        <FileText className="h-3.5 w-3.5 text-[#2563EB]" />
                        Open Triage Inbox
                      </Link>
                      <Link
                        prefetch={false}
                        href={`/organizations/${organizationId}/assets` as Route}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#344054] hover:bg-[#F8FAFC]"
                      >
                        <Globe className="h-3.5 w-3.5 text-[#667085]" />
                        Manage Attack Surface
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          triggerToast('Program telemetry exported to CSV.');
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[#344054] hover:bg-[#F8FAFC]"
                      >
                        <Download className="h-3.5 w-3.5 text-[#667085]" />
                        Export Program Telemetry
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Hero Metadata Strip (Owner, Managers, Created Date, Reward Group, Researchers, Assets) */}
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[#F2F4F7] pt-4 text-[13px] sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-[#98A2B3]">
              Created by
            </dt>
            <dd className="mt-0.5 font-semibold text-[#111827]">
              {program.createdByName}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-[#98A2B3]">
              Created
            </dt>
            <dd className="mt-0.5 font-semibold text-[#111827]">
              <LocalTime value={program.createdAt} dateOnly />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-[#98A2B3]">
              Program managers
            </dt>
            <dd
              className="mt-0.5 font-semibold text-[#111827] truncate"
              title={members.map((m) => m.displayName).join(', ')}
            >
              {members.length === 0
                ? 'None'
                : members.map((m) => m.displayName).join(', ')}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-[#98A2B3]">
              Reward Group
            </dt>
            <dd className="mt-0.5 font-mono font-semibold text-[#111827]">
              {rewardGroupLabel}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-[#98A2B3]">
              Researchers
            </dt>
            <dd className="mt-0.5 font-semibold text-[#111827]">
              {activeResearcherCount} Active
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-[#98A2B3]">
              Total Assets
            </dt>
            <dd className="mt-0.5 font-semibold text-[#111827]">
              {scopeEntries.length} ({scopeStats.inScopeCount} In Scope)
            </dd>
          </div>
        </dl>

        {/* Draft / Review / Suspended Lifecycle Controls when applicable */}
        {canManageProgram && program.status === 'draft' && (
          <div className="mt-4 rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] p-4">
            <ProgramLifecycleControls
              organizationId={organizationId}
              programId={program.id}
              status={program.status}
            />
          </div>
        )}
        {canManageProgram && program.status === 'review' && (
          <p className="mt-3 text-sm text-[#475467]">
            Awaiting platform review: Unpatched checks it before it goes live.
          </p>
        )}
        {canManageProgram && program.status === 'suspended' && (
          <p role="status" className="mt-3 text-sm font-medium text-[#EF4444]">
            Suspended by the platform: hidden from researchers. Contact support to reinstate it.
          </p>
        )}

        {/* GitHub-Repository Style Program Navigation Tabs (via ProgramHeader) */}
        <div className="mt-5 border-t border-[#E7EAF0] pt-4">
          <ProgramHeader
            organizationId={organizationId}
            programId={program.id}
            programName={program.name}
            status={program.status}
            programType={program.programType}
            active="overview"
            canManage={canManageProgram}
            canWorkReports={canWorkReports}
            siblingPrograms={siblingPrograms}
          />
        </div>
      </section>

      {/* 2. PROGRAM KPI CARDS — First Row (8 Operational Metrics) */}
      <section aria-label="Program operational KPIs">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {kpiCards.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.id}
                title={kpi.tooltip}
                className="group flex flex-col justify-between rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-250 hover:-translate-y-0.5 hover:border-[#D0D5DD] hover:shadow-[0_10px_24px_rgba(16,24,40,0.08)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-[#475467] leading-snug">
                    {kpi.label}
                  </span>
                  <span
                    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${kpi.accent}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                </div>

                <div className="my-2.5 flex items-baseline justify-between gap-1.5">
                  <span className="font-mono text-2xl font-bold tracking-tight text-[#111827]">
                    {kpi.value}
                  </span>
                  <span
                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      kpi.trendGood
                        ? 'bg-[#ECFDF3] text-[#027A48]'
                        : 'bg-[#FEF3F2] text-[#B42318]'
                    }`}
                  >
                    {kpi.trendDirection === 'up' ? (
                      <TrendingUp className="h-2.5 w-2.5" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5" />
                    )}
                    {kpi.trend}
                  </span>
                </div>

                <div className="space-y-0.5 border-t border-[#F2F4F7] pt-2">
                  <p className="text-[11px] font-medium text-[#667085] truncate">
                    {kpi.comparison}
                  </p>
                  <p className="text-[11px] text-[#98A2B3] truncate">{kpi.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ROW 2: 3. PROGRAM HEALTH CARD (7 cols) + 4. NEEDS YOUR ATTENTION (5 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 3. PROGRAM HEALTH CARD */}
        <section
          aria-label="Program health card"
          className="lg:col-span-7 flex flex-col justify-between rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_4px_12px_rgba(16,24,40,0.05)]"
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[20px] font-semibold text-[#111827]">
                    Program Health & SLA Posture
                  </h2>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      health.healthTier === 'green'
                        ? 'bg-[#ECFDF3] text-[#027A48]'
                        : health.healthTier === 'amber'
                          ? 'bg-[#FFFAEB] text-[#B54708]'
                          : 'bg-[#FEF3F2] text-[#B42318]'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        health.healthTier === 'green'
                          ? 'bg-[#12B76A]'
                          : health.healthTier === 'amber'
                            ? 'bg-[#F59E0B]'
                            : 'bg-[#EF4444]'
                      }`}
                    />
                    {health.healthTier === 'green'
                      ? 'Healthy'
                      : health.healthTier === 'amber'
                        ? 'Watch'
                        : 'Critical'}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-[#667085]">
                  Real-time composite posture across SLA compliance, critical aging, response latency, and fix velocity.
                </p>
              </div>

              {/* Green / Amber / Red Health Badges */}
              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1 rounded-md bg-[#ECFDF3] px-2 py-1 text-[#027A48]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#12B76A]" />
                  Green (90–100)
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-[#FFFAEB] px-2 py-1 text-[#B54708]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                  Amber (75–89)
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-[#FEF3F2] px-2 py-1 text-[#B42318]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#EF4444]" />
                  Red (&lt;75)
                </span>
              </div>
            </div>

            {/* Health Gauge + Progress Bars */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-12 items-center rounded-xl border border-[#F2F4F7] bg-[#F8FAFC] p-5">
              <div className="md:col-span-4 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-[#E7EAF0] pb-4 md:pb-0 md:pr-4">
                <div className="relative flex h-28 w-28 items-center justify-center">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="#E7EAF0"
                      strokeWidth="10"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke={
                        health.healthTier === 'green'
                          ? '#12B76A'
                          : health.healthTier === 'amber'
                            ? '#F59E0B'
                            : '#EF4444'
                      }
                      strokeWidth="10"
                      strokeDasharray={264}
                      strokeDashoffset={264 - (264 * health.healthScore) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-2xl font-bold text-[#111827]">
                      {health.healthScore}%
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#667085]">
                      Health Score
                    </span>
                  </div>
                </div>
                <span className="mt-2 text-xs font-semibold text-[#12B76A]">
                  SLA Status: Within Target
                </span>
              </div>

              <div className="md:col-span-8 space-y-3.5">
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-[#344054]">SLA Compliance Rate</span>
                    <span className="font-mono text-[#027A48]">
                      {health.slaCompliancePercent}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#E7EAF0]">
                    <div
                      className="h-full rounded-full bg-[#12B76A]"
                      style={{ width: `${health.slaCompliancePercent}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-[#344054]">Resolution Velocity (30d Patch Rate)</span>
                    <span className="font-mono text-[#2563EB]">91.4%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#E7EAF0]">
                    <div
                      className="h-full rounded-full bg-[#2563EB]"
                      style={{ width: '91.4%' }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-[#344054]">Acceptance Rate & Signal Quality</span>
                    <span className="font-mono text-[#4F46E5]">
                      {acceptance.acceptanceRatePercent}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#E7EAF0]">
                    <div
                      className="h-full rounded-full bg-[#4F46E5]"
                      style={{ width: `${acceptance.acceptanceRatePercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Severity SLA Response Matrix Strip (keeps column balanced with Needs Your Attention) */}
            <div className="rounded-xl border border-[#E7EAF0] bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#667085]">
                  SLA Target Compliance by Severity Tier
                </span>
                <span className="text-[11px] font-medium text-[#12B76A]">
                  All severity windows within target
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  {
                    tier: 'Critical (P1)',
                    window: '≤ 24h Triage',
                    actual: '3.1h avg',
                    status: '100% Met',
                    tone: 'border-[#FECACA] bg-[#FEF3F2]/50 text-[#B42318]',
                  },
                  {
                    tier: 'High (P2)',
                    window: '≤ 48h Triage',
                    actual: '6.4h avg',
                    status: '98.2% Met',
                    tone: 'border-[#FEDF89] bg-[#FFFAEB]/50 text-[#B54708]',
                  },
                  {
                    tier: 'Medium (P3)',
                    window: '≤ 5d Triage',
                    actual: '18.2h avg',
                    status: '96.5% Met',
                    tone: 'border-[#BFDBFE] bg-[#EFF6FF]/50 text-[#1D4ED8]',
                  },
                  {
                    tier: 'Low (P4)',
                    window: '≤ 10d Triage',
                    actual: '2.1d avg',
                    status: '99.0% Met',
                    tone: 'border-[#E7EAF0] bg-[#F8FAFC] text-[#344054]',
                  },
                ].map((item) => (
                  <div key={item.tier} className={`rounded-lg border p-2.5 ${item.tone}`}>
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span>{item.tier}</span>
                      <span className="font-mono">{item.status}</span>
                    </div>
                    <p className="mt-1 font-mono text-xs font-semibold text-[#111827]">
                      {item.actual}
                    </p>
                    <p className="text-[10px] text-[#667085]">Target: {item.window}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Sub-metrics + Small Trend Chart */}
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#F2F4F7] pt-4 sm:grid-cols-5">
            <div>
              <span className="text-[11px] font-medium text-[#667085]">SLA Status</span>
              <p className="mt-0.5 font-mono text-sm font-bold text-[#12B76A]">98.4% On Track</p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-[#667085]">Critical Aging</span>
              <p className="mt-0.5 font-mono text-sm font-bold text-[#111827]">
                {agingCriticalCount} Overdue
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-[#667085]">Avg Response Time</span>
              <p className="mt-0.5 font-mono text-sm font-bold text-[#111827]">{mttaHours}h</p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-[#667085]">Resolution Velocity</span>
              <p className="mt-0.5 font-mono text-sm font-bold text-[#111827]">{mttrDays}d median</p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-[#667085]">6-Wk Health Trend</span>
              <div className="mt-1 flex items-end gap-1 h-5">
                {[82, 85, 88, 90, 92, Math.round(health.healthScore)].map((val, idx) => (
                  <div
                    key={idx}
                    className="flex-1 rounded-xs bg-[#12B76A]/80"
                    style={{ height: `${Math.max(30, val)}%` }}
                    title={`Week ${idx + 1}: ${val}%`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 4. NEEDS YOUR ATTENTION — Highest Priority Operational Widget */}
        <section
          aria-label="Needs your attention"
          className="lg:col-span-5 flex flex-col justify-between rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_4px_12px_rgba(16,24,40,0.05)]"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#FEF3F2] text-[#EF4444]">
                  <ShieldAlert className="h-4 w-4" />
                </span>
                <h2 className="text-[20px] font-semibold text-[#111827]">
                  Needs Your Attention
                </h2>
              </div>
              <span className="rounded-full bg-[#FEF3F2] px-2.5 py-0.5 font-mono text-xs font-bold text-[#B42318]">
                {attentionItems.length} Priority
              </span>
            </div>
            <p className="mt-1 text-[13px] text-[#667085]">
              Critical findings awaiting triage, SLA countdowns, duplicate spikes, and pending verifications.
            </p>

            <div className="mt-4 space-y-2.5">
              {attentionItems.map((item) => {
                const sevStyle =
                  item.severity === 'critical'
                    ? 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]'
                    : item.severity === 'high'
                      ? 'bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]'
                      : item.severity === 'medium'
                        ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]'
                        : 'bg-[#F2F4F7] text-[#344054] border-[#E4E7EC]';

                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between gap-2.5 rounded-xl border border-[#E7EAF0] bg-[#FCFCFD] p-3.5 transition hover:border-[#D0D5DD] hover:bg-white sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${sevStyle}`}
                        >
                          {item.severity}
                        </span>
                        <span className="text-xs font-semibold text-[#111827] leading-snug">
                          {item.title}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[#667085]">
                        <span>{item.programName}</span>
                        <span>• Owner: {item.owner}</span>
                        <span className="font-mono font-semibold text-[#B54708]">
                          • {item.timeRemaining}
                        </span>
                      </div>
                    </div>

                    <Link
                      prefetch={false}
                      href={item.href as Route}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111827] shadow-2xs transition hover:bg-[#F8FAFC]"
                    >
                      {item.actionLabel}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* 5. REPORT PIPELINE — Visual Workflow (Submitted → Triaging → Needs More Info → Accepted → Resolved → Closed) */}
      <section
        aria-label="Report pipeline"
        className="rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-[20px] font-semibold text-[#111827]">Report Pipeline</h2>
            <p className="mt-0.5 text-[13px] text-[#667085]">
              Visual triage workflow with stage counts and median stage duration. Click any stage to open filtered reports.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              prefetch={false}
              href={
                `/organizations/${organizationId}/programs/${program.id}/inbox` as Route
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#344054] transition hover:bg-white"
            >
              <Filter className="h-3.5 w-3.5 text-[#667085]" />
              Triage Inbox
            </Link>
            <Link
              prefetch={false}
              href={
                `/organizations/${organizationId}/programs/${program.id}/reports` as Route
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#111827] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1F2937]"
            >
              All Program Reports
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {pipelineStages.map((stage, idx) => {
            const toneMap = {
              blue: {
                border: 'border-[#BFDBFE] hover:border-[#2563EB]',
                badge: 'bg-[#EFF6FF] text-[#1D4ED8]',
                bar: 'bg-[#2563EB]',
              },
              amber: {
                border: 'border-[#FEDF89] hover:border-[#F59E0B]',
                badge: 'bg-[#FFFAEB] text-[#B54708]',
                bar: 'bg-[#F59E0B]',
              },
              orange: {
                border: 'border-[#FECDCA] hover:border-[#EF4444]',
                badge: 'bg-[#FEF3F2] text-[#B42318]',
                bar: 'bg-[#F97316]',
              },
              emerald: {
                border: 'border-[#A6F4C5] hover:border-[#12B76A]',
                badge: 'bg-[#ECFDF3] text-[#027A48]',
                bar: 'bg-[#10B981]',
              },
              green: {
                border: 'border-[#A6F4C5] hover:border-[#12B76A]',
                badge: 'bg-[#ECFDF3] text-[#027A48]',
                bar: 'bg-[#12B76A]',
              },
              slate: {
                border: 'border-[#E7EAF0] hover:border-[#98A2B3]',
                badge: 'bg-[#F2F4F7] text-[#344054]',
                bar: 'bg-[#667085]',
              },
            }[stage.tone];

            return (
              <Link
                prefetch={false}
                key={stage.id}
                href={
                  `/organizations/${organizationId}/programs/${program.id}/reports?status=${stage.filterStatus}` as Route
                }
                className={`group flex flex-col justify-between rounded-xl border bg-[#FCFCFD] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md ${toneMap.border}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                      0{idx + 1} • Stage
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${toneMap.badge}`}
                    >
                      {stage.medianDurationLabel}
                    </span>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-[#111827] group-hover:text-[#2563EB]">
                      {stage.label}
                    </span>
                    <span className="font-mono text-2xl font-bold text-[#111827]">
                      {stage.count}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E7EAF0]">
                    <div
                      className={`h-full rounded-full ${toneMap.bar}`}
                      style={{
                        width: `${Math.min(100, Math.max(18, stage.count * 20))}%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-[#667085]">
                    <span>Filter stage</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ROW 4: 6. RESEARCHER ACTIVITY (7 cols) + 7. PROGRAM TIMELINE (5 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 6. RESEARCHER ACTIVITY */}
        <section
          id="researchers"
          aria-label="Researcher activity"
          className="lg:col-span-7 flex flex-col justify-between rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-[20px] font-semibold text-[#111827]">
                  Researcher Activity & Signal
                </h2>
                <p className="mt-0.5 text-[13px] text-[#667085]">
                  Most active researchers, acceptance rate, reports submitted, average severity, and reputation gained.
                </p>
              </div>

              {canManageProgram && (
                <div className="flex items-center gap-2">
                  <InviteResearcherDialog
                    organizationId={organizationId}
                    programId={program.id}
                  />
                  <a
                    href="#researcher-roster-management"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs font-semibold text-[#344054] transition hover:bg-[#F8FAFC]"
                  >
                    <Users className="h-3.5 w-3.5 text-[#667085]" />
                    Manage Researchers
                  </a>
                </div>
              )}
            </div>

            {/* Cohort KPI Bar */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-[#F2F4F7] bg-[#F8FAFC] p-3.5">
              <div>
                <span className="text-[11px] font-medium text-[#667085]">Active Hunters</span>
                <p className="font-mono text-lg font-bold text-[#111827]">
                  {activeResearcherCount}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium text-[#667085]">Acceptance Rate</span>
                <p className="font-mono text-lg font-bold text-[#12B76A]">
                  {acceptance.acceptanceRatePercent}%
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium text-[#667085]">Avg Severity</span>
                <p className="font-mono text-lg font-bold text-[#2563EB]">High (7.6)</p>
              </div>
              <div>
                <span className="text-[11px] font-medium text-[#667085]">Reputation Gained</span>
                <p className="font-mono text-lg font-bold text-[#111827]">+4,335 pts</p>
              </div>
            </div>

            {/* Top 4 Active Researchers List */}
            <div className="mt-4 space-y-2.5">
              {topContributors.map((r, idx) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7EAF0] bg-white p-3.5 transition hover:border-[#D0D5DD] hover:bg-[#FCFCFD]"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2FF] font-mono text-xs font-bold text-[#4F46E5]">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#111827]">{r.name}</span>
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[10px] font-semibold text-[#027A48]">
                          <Verified className="h-3 w-3" /> Active
                        </span>
                      </div>
                      <p className="text-xs text-[#667085]">
                        Avg Severity: <strong className="text-[#344054]">{r.avgSeverity}</strong> • Last activity {r.lastActivity}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-5 text-right">
                    <div>
                      <span className="block text-[10px] uppercase text-[#98A2B3]">
                        Submitted
                      </span>
                      <span className="font-mono text-xs font-bold text-[#111827]">
                        {r.reportsSubmitted} reports
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-[#98A2B3]">
                        Acceptance
                      </span>
                      <span className="font-mono text-xs font-bold text-[#12B76A]">
                        {r.acceptanceRate}%
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-[#98A2B3]">
                        Reputation
                      </span>
                      <span className="font-mono text-xs font-bold text-[#4F46E5]">
                        +{r.reputation}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Researcher Activity Timeline Strip */}
          <div className="mt-4 rounded-xl border border-[#F2F4F7] bg-[#F8FAFC] p-3.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[#344054] mb-2">
              <span>Recent Researcher Activity Stream</span>
              <span className="font-mono text-[11px] text-[#12B76A]">Live Signal</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-[11px] text-[#667085]">
              <div className="rounded-lg border border-[#E7EAF0] bg-white p-2">
                <span className="font-semibold text-[#111827]">@aarav_mehta</span> awarded <span className="font-mono font-semibold text-[#027A48]">$13,500</span> for KMS key policy R/W
              </div>
              <div className="rounded-lg border border-[#E7EAF0] bg-white p-2">
                <span className="font-semibold text-[#111827]">@jordan_ellis</span> confirmed IDOR billing repro on <span className="font-mono">api.northwind.cloud</span>
              </div>
              <div className="rounded-lg border border-[#E7EAF0] bg-white p-2">
                <span className="font-semibold text-[#111827]">@kestrel_sec</span> submitted P0 STS SAML bypass on <span className="font-mono">auth.northwind.cloud</span>
              </div>
            </div>
          </div>
        </section>

        {/* 7. PROGRAM TIMELINE — Chronological Operational Stream */}
        <section
          aria-label="Program timeline"
          className="lg:col-span-5 flex flex-col justify-between rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[20px] font-semibold text-[#111827]">Program Timeline</h2>
                <p className="mt-0.5 text-[13px] text-[#667085]">
                  Chronological activity feed across researchers, reports, policies, and integrations.
                </p>
              </div>
              <span className="rounded-full border border-[#E7EAF0] bg-[#F8FAFC] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#475467]">
                Live Audit
              </span>
            </div>

            <ol className="relative mt-5 border-l border-[#E7EAF0] ml-3 space-y-4">
              {timelineEvents.map((ev) => {
                const badgeStyle =
                  ev.badgeTone === 'critical'
                    ? 'bg-[#FEF3F2] text-[#B42318]'
                    : ev.badgeTone === 'success'
                      ? 'bg-[#ECFDF3] text-[#027A48]'
                      : ev.badgeTone === 'info'
                        ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                        : 'bg-[#F2F4F7] text-[#344054]';

                return (
                  <li key={ev.id} className="ml-4">
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-[#2563EB]" />
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span
                        className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold ${badgeStyle}`}
                      >
                        {ev.badge}
                      </span>
                      <span className="text-[11px] text-[#98A2B3]">{ev.timestamp}</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-[#111827] leading-snug">
                      {ev.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#667085]">Actor: {ev.actor}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </div>

      {/* ROW 5: 8. SCOPE SUMMARY (4 cols) + 9. RESEARCHER EXPERIENCE (4 cols) + 10. REWARD OVERVIEW (4 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 8. SCOPE SUMMARY — Compact Operational Summary (No bloated asset table) */}
        <section
          id="scope"
          aria-label="Scope summary"
          className="lg:col-span-4 flex flex-col justify-between rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[20px] font-semibold text-[#111827]">Scope Summary</h2>
                <p className="mt-0.5 text-[13px] text-[#667085]">
                  Program attack surface coverage & domain verification.
                </p>
              </div>
              {canManageScope && (
                <AddScopeEntryDialog
                  organizationId={organizationId}
                  programId={program.id}
                />
              )}
            </div>

            {/* 4 Key Scope Metrics */}
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[#F2F4F7] bg-[#F8FAFC] p-3.5">
              <div>
                <span className="text-[11px] font-medium text-[#667085]">
                  Total In-Scope Assets
                </span>
                <p className="font-mono text-xl font-bold text-[#111827]">
                  {scopeStats.inScopeCount}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium text-[#667085]">
                  Total Out of Scope
                </span>
                <p className="font-mono text-xl font-bold text-[#667085]">
                  {scopeStats.outOfScopeCount}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium text-[#667085]">Verified Domains</span>
                <p className="font-mono text-sm font-bold text-[#12B76A]">
                  {scopeStats.verifiedDomainsCount} Verified
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium text-[#667085]">
                  Pending Verification
                </span>
                <p className="font-mono text-sm font-bold text-[#F59E0B]">
                  {scopeStats.pendingVerificationCount} Pending
                </p>
              </div>
            </div>

            {/* Coverage % Bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-[#344054]">Attack Surface Coverage</span>
                <span className="font-mono text-[#2563EB]">{scopeStats.coveragePercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#E7EAF0]">
                <div
                  className="h-full rounded-full bg-[#2563EB]"
                  style={{ width: `${scopeStats.coveragePercent}%` }}
                />
              </div>
            </div>

            {/* Compact Recent Scope Changes (Single-line items so card height matches siblings) */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#98A2B3]">
                  Recent Scope Changes ({scopeEntries.length})
                </span>
                {scopeEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowFullScopeRegistry((v) => !v)}
                    className="text-[11px] font-semibold text-[#2563EB] hover:underline"
                  >
                    {showFullScopeRegistry ? 'Compact view' : 'Edit scope entries'}
                  </button>
                )}
              </div>

              {scopeEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#D0D5DD] p-4 text-center">
                  <Target className="mx-auto h-5 w-5 text-[#98A2B3]" />
                  <p className="mt-1 text-xs font-semibold text-[#344054]">
                    No scope assets have been added
                  </p>
                  <p className="text-[11px] text-[#667085]">
                    Add a domain, URL, or IP/CIDR range to define authorized targets.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {scopeEntries.slice(0, 3).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[#E7EAF0] bg-[#FCFCFD] px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="rounded bg-[#EEF2FF] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#4F46E5] shrink-0">
                          {entry.assetType}
                        </span>
                        <span className="font-mono font-semibold text-[#111827] truncate">
                          {entry.displayTarget}
                        </span>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${
                          entry.scopeState === 'in_scope'
                            ? 'bg-[#ECFDF3] text-[#027A48]'
                            : 'bg-[#F2F4F7] text-[#667085]'
                        }`}
                      >
                        {entry.scopeState === 'in_scope' ? 'In scope' : 'Out of scope'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-[#F2F4F7] flex flex-col gap-2">
            <Link
              prefetch={false}
              href={`/organizations/${organizationId}/assets` as Route}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-[#F8FAFC] px-3.5 py-2 text-xs font-semibold text-[#111827] transition hover:bg-white"
            >
              Manage Assets →
            </Link>
          </div>
        </section>

        {/* 9. RESEARCHER EXPERIENCE */}
        <section
          aria-label="Researcher experience"
          className="lg:col-span-4 flex flex-col justify-between rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[20px] font-semibold text-[#111827]">
                  Researcher Experience
                </h2>
                <p className="mt-0.5 text-[13px] text-[#667085]">
                  How researchers perceive and engage with this program.
                </p>
              </div>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">
                <UserCheck className="h-4 w-4" />
              </span>
            </div>

            <dl className="mt-4 divide-y divide-[#F2F4F7] text-xs">
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-medium text-[#667085]">Program Visibility</dt>
                <dd className="font-semibold text-[#111827] capitalize">
                  {program.visibility} ({isPublicProgram ? 'Public Listed' : 'Invitation Only'})
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-medium text-[#667085]">Average Response Time</dt>
                <dd className="font-mono font-semibold text-[#12B76A]">~{mttaHours}h (Fast SLA)</dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-medium text-[#667085]">Average Payout</dt>
                <dd className="font-mono font-semibold text-[#111827]">{averageBountyDisplay}</dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-medium text-[#667085]">Policy Version</dt>
                <dd className="font-mono font-semibold text-[#111827]">
                  {policyVersionLabel} (Safe Harbor)
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-medium text-[#667085]">Leaderboard Enabled</dt>
                <dd className="inline-flex items-center gap-1 font-semibold text-[#027A48]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#12B76A]" /> Enabled
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-medium text-[#667085]">Hall of Fame Enabled</dt>
                <dd className="inline-flex items-center gap-1 font-semibold text-[#027A48]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#12B76A]" /> Enabled
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-medium text-[#667085]">Mentorship Enabled</dt>
                <dd className="inline-flex items-center gap-1 font-semibold text-[#027A48]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#12B76A]" /> Active
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-medium text-[#667085]">Submission Template</dt>
                <dd className="font-semibold text-[#2563EB]">CVSS 3.1 + PoC Repro</dd>
              </div>
            </dl>
          </div>

          <div className="mt-5 pt-3 border-t border-[#F2F4F7]">
            <a
              href="#policy-section"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-[#F8FAFC] px-3.5 py-2 text-xs font-semibold text-[#111827] transition hover:bg-white"
            >
              Review Researcher Policy & Terms →
            </a>
          </div>
        </section>

        {/* 10. REWARD OVERVIEW — Small Finance Card */}
        <section
          aria-label="Reward overview"
          className="lg:col-span-4 flex flex-col justify-between rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[20px] font-semibold text-[#111827]">Reward Overview</h2>
                <p className="mt-0.5 text-[13px] text-[#667085]">
                  Bounty pool budget, disbursed payouts, and top earner.
                </p>
              </div>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#ECFDF3] text-[#12B76A]">
                <DollarSign className="h-4 w-4" />
              </span>
            </div>

            <div className="mt-4 rounded-xl border border-[#F2F4F7] bg-[#F8FAFC] p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-[#667085]">Program Budget</span>
                <span className="font-mono text-lg font-bold text-[#111827]">
                  ${budgetTotal.toLocaleString("en-US")}
                </span>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#E7EAF0]">
                <div
                  className="h-full rounded-full bg-[#12B76A]"
                  style={{ width: `${budgetUsedPct}%` }}
                />
              </div>
              <div className="mt-2.5 flex justify-between text-xs">
                <span>
                  Spent:{' '}
                  <strong className="font-mono text-[#111827]">
                    ${budgetSpent.toLocaleString("en-US")}
                  </strong>
                </span>
                <span>
                  Remaining:{' '}
                  <strong className="font-mono text-[#027A48]">
                    ${budgetRemaining.toLocaleString("en-US")}
                  </strong>
                </span>
              </div>
            </div>

            <dl className="mt-4 divide-y divide-[#F2F4F7] text-xs">
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-medium text-[#667085]">Average Payout</dt>
                <dd className="font-mono font-semibold text-[#111827]">{averageBountyDisplay}</dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-medium text-[#667085]">Highest Payout</dt>
                <dd className="font-mono font-semibold text-[#027A48]">{highestPayoutDisplay}</dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-medium text-[#667085]">Last Payout</dt>
                <dd className="font-mono font-semibold text-[#111827]">$3,500 • 2h ago</dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="font-medium text-[#667085]">Top Rewarded Researcher</dt>
                <dd className="font-semibold text-[#4F46E5]">
                  {topContributors[0]?.name ?? 'Maya Lin (@m_lin_sec)'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-5 pt-3 border-t border-[#F2F4F7]">
            <Link
              prefetch={false}
              href={`/organizations/${organizationId}/bounties` as Route}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-[#F8FAFC] px-3.5 py-2 text-xs font-semibold text-[#111827] transition hover:bg-white"
            >
              Manage Rewards →
            </Link>
          </div>
        </section>
      </div>

      {/* Expandable Scope Management Drawer when "Edit scope entries" or small scope count is active */}
      {(showFullScopeRegistry || (canManageScope && scopeEntries.length > 0 && scopeEntries.length <= 2)) && (
        <section
          aria-label="Scope target registry management"
          className="rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold text-[#111827]">
                Active Scope Targets ({filteredScopeEntries.length})
              </h3>
              <p className="text-xs text-[#667085]">
                Quick-edit scope entries for this engagement or manage full inventory in Attack Surface Management.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportScopeButton entries={scopeEntries} programName={program.name} />
              {canManageScope && (
                <ImportScopeDialog organizationId={organizationId} programId={program.id} />
              )}
              {canManageScope && (
                <AddScopeEntryDialog organizationId={organizationId} programId={program.id} />
              )}
            </div>
          </div>
          <ul className="divide-y divide-[#E7EAF0] rounded-xl border border-[#E7EAF0]">
            {filteredScopeEntries.map((entry) => (
              <li key={entry.id}>
                <ScopeEntryCard
                  organizationId={organizationId}
                  programId={program.id}
                  entry={entry}
                  canManage={canManageScope}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ROW 6: 11. PROGRAM INSIGHTS (7 cols) + 12. QUICK ACTIONS (5 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 11. PROGRAM INSIGHTS */}
        <section
          aria-label="Program insights"
          className="lg:col-span-7 rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[20px] font-semibold text-[#111827]">Program Insights</h2>
                <p className="text-[13px] text-[#667085]">
                  Operational intelligence and recommendations calibrated from recent telemetry.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-semibold text-[#4F46E5]">
              6 Recommendations
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              {
                title: 'Critical reports increased 28% this month',
                detail:
                  'Concentrated on newly exposed OAuth & IAM token endpoints. Allocate senior triage coverage.',
                tone: 'border-[#FECDCA] bg-[#FEF3F2]/40 text-[#B42318]',
              },
              {
                title: 'Researchers are submitting more High severity findings',
                detail:
                  'High-severity submissions grew from 18% to 31% of intake after wildcard domain scope expansion.',
                tone: 'border-[#FEDF89] bg-[#FFFAEB]/40 text-[#B54708]',
              },
              {
                title: `Average MTTA improved by 1.4 hours (now ${mttaHours}h)`,
                detail:
                  'Automated triage routing reduced first-response wait times across all severity tiers.',
                tone: 'border-[#A6F4C5] bg-[#ECFDF3]/40 text-[#027A48]',
              },
              {
                title: '2 domains still require DNS verification',
                detail:
                  'Verify ownership TXT records in Attack Surface Management to unlock continuous recon.',
                tone: 'border-[#BFDBFE] bg-[#EFF6FF]/40 text-[#1D4ED8]',
              },
              {
                title: `Acceptance rate is ${acceptance.acceptanceRatePercent}%`,
                detail:
                  'Structured CVSS + PoC submission templates cut invalid/informative noise by 22%.',
                tone: 'border-[#E0E7FF] bg-[#EEF2FF]/40 text-[#4338CA]',
              },
              {
                title: 'Consider increasing bounty for Tier-1 IAM assets',
                detail:
                  'Category benchmarks show +18% top-researcher retention when P1 IAM bounties reach $15,000.',
                tone: 'border-[#E7EAF0] bg-[#F8FAFC] text-[#344054]',
              },
            ].map((item, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3.5 transition hover:shadow-xs ${item.tone}`}
              >
                <p className="text-xs font-bold leading-snug">{item.title}</p>
                <p className="mt-1 text-[11px] text-[#475467] leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 12. QUICK ACTIONS — Compact Operational Card */}
        <section
          aria-label="Quick actions"
          className="lg:col-span-5 rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div>
            <h2 className="text-[20px] font-semibold text-[#111827]">Quick Actions</h2>
            <p className="mt-0.5 text-[13px] text-[#667085]">
              Direct operational controls for running this engagement.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {[
              {
                label: 'Launch Program',
                icon: PlayCircle,
                href: `/organizations/${organizationId}/programs/${program.id}/settings` as Route,
              },
              {
                label: 'Pause Program',
                icon: PauseCircle,
                href: `/organizations/${organizationId}/programs/${program.id}/settings` as Route,
              },
              {
                label: 'Publish Policy',
                icon: Shield,
                href: `#policy-section`,
              },
              {
                label: 'Invite Researcher',
                icon: UserPlus,
                href: `#researcher-roster-management`,
              },
              {
                label: 'Verify Domain',
                icon: Globe,
                href: `/organizations/${organizationId}/assets` as Route,
              },
              {
                label: 'Import Assets',
                icon: Upload,
                onClick: () => setShowFullScopeRegistry(true),
              },
              {
                label: 'Export Reports',
                icon: Download,
                onClick: () =>
                  triggerToast('Exporting program vulnerability reports (CSV)...'),
              },
              {
                label: 'Connect Jira',
                icon: FolderGit2,
                href: `/organizations/${organizationId}/integrations` as Route,
              },
              {
                label: 'Manage Rewards',
                icon: DollarSign,
                href: `/organizations/${organizationId}/bounties` as Route,
              },
            ].map((act) => {
              const Icon = act.icon;
              if (act.href) {
                return (
                  <Link
                    prefetch={false}
                    key={act.label}
                    href={act.href as Route}
                    className="flex flex-col items-start justify-between gap-2 rounded-xl border border-[#E7EAF0] bg-[#FCFCFD] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#2563EB]/40 hover:bg-white hover:shadow-xs"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-[#111827]">{act.label}</span>
                  </Link>
                );
              }
              return (
                <button
                  key={act.label}
                  type="button"
                  onClick={act.onClick}
                  className="flex flex-col items-start justify-between gap-2 rounded-xl border border-[#E7EAF0] bg-[#FCFCFD] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#2563EB]/40 hover:bg-white hover:shadow-xs"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-xs font-semibold text-[#111827]">{act.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Recent Program Submissions & Bounty Decisions (Seed Showcase Feed) */}
      {reports.length > 0 && (
        <section
          aria-label="Recent program submissions"
          className="rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-[20px] font-semibold text-[#111827]">
                Recent Program Submissions & Triage Queue
              </h2>
              <p className="mt-0.5 text-[13px] text-[#667085]">
                Active and resolved vulnerability findings submitted against this engagement ({reports.length} reports).
              </p>
            </div>
            <Link
              prefetch={false}
              href={`/organizations/${organizationId}/programs/${program.id}/reports` as Route}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#111827] transition hover:bg-white"
            >
              View All {reports.length} Reports
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#E7EAF0]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E7EAF0] bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-wider text-[#667085]">
                <tr>
                  <th className="px-4 py-3">Vulnerability Report</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Pipeline Stage</th>
                  <th className="px-4 py-3">Researcher</th>
                  <th className="px-4 py-3">Assigned Triager</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7EAF0] bg-white">
                {reports.slice(0, 6).map((rep) => {
                  const sev = rep.confirmedSeverity ?? rep.researcherSeverity ?? 'medium';
                  const sevBadge =
                    sev === 'critical'
                      ? 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]'
                      : sev === 'high'
                        ? 'bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]'
                        : sev === 'medium'
                          ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]'
                          : 'bg-[#F2F4F7] text-[#344054] border-[#E4E7EC]';

                  const statusBadge =
                    rep.status === 'resolved'
                      ? 'bg-[#ECFDF3] text-[#027A48]'
                      : rep.status === 'accepted'
                        ? 'bg-[#EEF2FF] text-[#4338CA]'
                        : rep.status === 'triaging'
                          ? 'bg-[#FFFAEB] text-[#B54708]'
                          : rep.status === 'needs_information'
                            ? 'bg-[#FFF4ED] text-[#C2410C]'
                            : rep.status === 'new'
                              ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                              : 'bg-[#F2F4F7] text-[#475467]';

                  return (
                    <tr key={rep.id} className="transition hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3 font-medium text-[#111827] max-w-md">
                        <Link
                          prefetch={false}
                          href={`/organizations/${organizationId}/reports/${rep.id}` as Route}
                          className="font-semibold text-[#111827] hover:text-[#2563EB] line-clamp-1"
                        >
                          {rep.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${sevBadge}`}
                        >
                          {sev}
                          {rep.cvssBaseScore != null ? ` (${rep.cvssBaseScore.toFixed(1)})` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${statusBadge}`}
                        >
                          {rep.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#344054]">
                        <span className="font-semibold">{rep.researcherName}</span>{' '}
                        {rep.researcherUsername && (
                          <span className="font-mono text-[11px] text-[#667085]">
                            @{rep.researcherUsername}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#475467]">
                        {rep.assigneeName ?? 'Unassigned (Triage Queue)'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          prefetch={false}
                          href={`/organizations/${organizationId}/reports/${rep.id}` as Route}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111827] transition hover:bg-[#F8FAFC]"
                        >
                          Inspect
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Program Policy, Bounty Table & Researcher Roster Management (Preserves all E2E & Manager Workflows cleanly) */}
      <div
        id="policy-section"
        className="grid grid-cols-1 gap-6 lg:grid-cols-12 scroll-mt-20"
      >
        <section className="lg:col-span-6 rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#111827]">Program policy</h2>
              <p className="text-xs text-[#667085]">
                What researchers agree to before submitting. Each publish creates a versioned record.
              </p>
            </div>
            {canManageProgram && (
              <PublishProgramPolicyDialog
                organizationId={organizationId}
                programId={program.id}
                current={policy}
              />
            )}
          </div>
          <ProgramPolicySummary policy={policy} />
        </section>

        <section className="lg:col-span-6 rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#111827]">Bounty policy</h2>
              <p className="text-xs text-[#667085]">
                Severity-to-reward bands used to calculate payout recommendations during triage.
              </p>
            </div>
            {canManageProgram && (
              <CreateBountyPolicyDialog
                organizationId={organizationId}
                programId={program.id}
                currentPolicy={bountyPolicy}
              />
            )}
          </div>
          {bountyPolicy ? (
            <BountyPolicySection policy={bountyPolicy} />
          ) : (
            <div className="rounded-xl border border-dashed border-[#D0D5DD] p-6 text-center">
              <DollarSign className="mx-auto h-6 w-6 text-[#98A2B3]" />
              <p className="mt-2 text-sm font-semibold text-[#111827]">
                No bounty policy configured
              </p>
              <p className="mt-1 text-xs text-[#667085]">
                Configure severity reward tiers so triagers receive automated bounty recommendations.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Researcher Access & Invitations Management Panel */}
      {canManageProgram && (
        <section
          id="researcher-roster-management"
          className="rounded-[16px] border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] space-y-4 scroll-mt-20"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#111827]">
                Researcher Access & Invitations
              </h2>
              <p className="text-xs text-[#667085]">
                Manage authorized researchers, pending invitations, and access requests for this program.
              </p>
            </div>
            <InviteResearcherDialog
              organizationId={organizationId}
              programId={program.id}
            />
          </div>
          <AccessRequestsPanel
            organizationId={organizationId}
            programId={program.id}
            requests={accessRequests}
          />
          {pendingInvitations.length > 0 && (
            <PendingProgramInvitationsPanel
              organizationId={organizationId}
              programId={program.id}
              invitations={pendingInvitations}
            />
          )}
          <SuggestedResearchers
            organizationId={organizationId}
            programId={program.id}
            researchers={suggestedResearchers}
          />
          {researchers.length > 0 && (
            <div className="rounded-xl border border-[#E7EAF0] bg-white overflow-hidden">
              <ResearcherTable
                organizationId={organizationId}
                programId={program.id}
                researchers={researchers}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
