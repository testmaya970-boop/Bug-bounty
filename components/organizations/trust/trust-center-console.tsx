"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Globe,
  FolderGit2,
  Smartphone,
  Cloud,
  Laptop,
  Network,
  Cpu,
  Bot,
  RefreshCw,
  Search,
  Filter,
  ArrowUpRight,
  TrendingUp,
  Download,
  Copy,
  Check,
  Sliders,
  ExternalLink,
  Clock,
  Sparkles,
  Layers,
  FileText,
  BadgeCheck,
  Building2,
  Plug,
  Calendar,
  ChevronRight,
  ChevronDown,
  Info,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import {
  MOCK_TRUST_SCORE_BREAKDOWN,
  MOCK_ASSET_VERIFICATION_GROUPS,
  MOCK_DNS_VERIFICATION,
  MOCK_MANUAL_VERIFICATION_QUEUE,
  MOCK_SCOPE_INTEGRITY_ITEMS,
  MOCK_TRUST_RECOMMENDATIONS,
  MOCK_INTEGRATION_HEALTH,
  MOCK_TRUST_AUDIT_TIMELINE,
  type AssetVerificationGroup,
  type ManualVerificationRequest,
  type TrustRecommendation,
} from "../../../lib/mock/trust-center-intelligence";
import type { OrganizationRole } from "../../../types/auth";

type TrustTab =
  | "overview"
  | "workspace"
  | "dns"
  | "queue"
  | "integrity"
  | "integrations"
  | "compliance"
  | "timeline";

export function TrustCenterConsole({
  organizationId,
  organizationName,
  userRole,
}: {
  organizationId: string;
  organizationName: string;
  userRole?: OrganizationRole;
}) {
  const [activeTab, setActiveTab] = useState<TrustTab>("overview");
  const [selectedAssetType, setSelectedAssetType] = useState<string>("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [isVerifyingDNS, setIsVerifyingDNS] = useState(false);

  // Local state for queue approvals & recommendations
  const [queue, setQueue] = useState<ManualVerificationRequest[]>(MOCK_MANUAL_VERIFICATION_QUEUE);
  const [recommendations, setRecommendations] = useState<TrustRecommendation[]>(MOCK_TRUST_RECOMMENDATIONS);
  const [dnsStatus, setDnsStatus] = useState(MOCK_DNS_VERIFICATION);

  const notify = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    notify("Copied TXT token to clipboard.");
  };

  const handleTriggerDNSCheck = () => {
    setIsVerifyingDNS(true);
    setTimeout(() => {
      setIsVerifyingDNS(false);
      setDnsStatus((prev) => ({
        ...prev,
        lastChecked: "Just now",
        history: [
          {
            timestamp: "Just now",
            event: "Authoritative nameserver re-check: DNS TXT propagation verified across 8 PoPs",
            status: "success",
          },
          ...prev.history,
        ],
      }));
      notify("DNS TXT challenge verified successfully.");
    }, 1200);
  };

  const handleApproveQueue = (id: string) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: "approved" as const } : item)),
    );
    notify("Asset ownership proof approved and added to verified inventory.");
  };

  const handleRejectQueue = (id: string) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: "rejected" as const } : item)),
    );
    notify("Asset ownership request rejected.");
  };

  const handleDismissRec = (id: string) => {
    setRecommendations((prev) => prev.filter((r) => r.id !== id));
    notify("Recommendation applied.");
  };

  const filteredGroups = useMemo(() => {
    if (selectedAssetType === "all") return MOCK_ASSET_VERIFICATION_GROUPS;
    return MOCK_ASSET_VERIFICATION_GROUPS.filter((g) => g.type === selectedAssetType);
  }, [selectedAssetType]);

  const stats = MOCK_TRUST_SCORE_BREAKDOWN;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {actionSuccessMsg && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* 1. Hero Section */}
      <div className="relative overflow-hidden rounded-2xl border border-[#E7EAF0] bg-gradient-to-b from-white to-[#F9FAFB] p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <ShieldCheck className="size-4.5" />
              </span>
              <h2 className="text-xl font-bold tracking-tight text-[#111827]">
                Security & Trust Center
              </h2>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                Tier 1 Verified
              </span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                SOC2 Type II Attested
              </span>
            </div>
            <p className="text-sm text-[#475467] max-w-2xl">
              Cryptographic ownership verification, asset scope integrity, and perimeter governance command center for{" "}
              <strong className="text-[#111827]">{organizationName}</strong>. Ensure researchers only test assets
              your organization provably controls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveTab("dns")}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-700"
            >
              <Globe className="size-3.5" />
              <span>Verify Domain</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("queue")}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
            >
              <FileText className="size-3.5 text-[#667085]" />
              <span>Submit Proof</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("integrity")}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
            >
              <ShieldAlert className="size-3.5 text-[#667085]" />
              <span>Scope Integrity</span>
            </button>
            <button
              type="button"
              onClick={() => notify("Generating cryptographic Trust Attestation Report (PDF)...")}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E7EAF0] bg-white px-3.5 py-2 text-xs font-semibold text-[#344054] shadow-sm hover:bg-[#F9FAFB]"
            >
              <Download className="size-3.5 text-[#667085]" />
              <span>Export Trust Report</span>
            </button>
          </div>
        </div>

        {/* Hero KPI Strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Trust Score Featured Card */}
          <div className="col-span-2 sm:col-span-1 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/70 to-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-700">
              <span>Trust Score</span>
              <span className="rounded bg-blue-600 text-white px-1.5 py-0.2 text-[10px] font-bold">
                {stats.grade}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#111827]">{stats.overallScore}</span>
              <span className="text-xs text-[#667085]">/ 100</span>
              <span className="text-[11px] font-bold text-emerald-600">{stats.trend}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full bg-blue-600 rounded-full"
                style={{ width: `${stats.overallScore}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Coverage %</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-[#111827]">{stats.coveragePercentage}%</span>
              <span className="text-[11px] font-semibold text-emerald-600">High</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">
              {stats.verifiedAssets} of {stats.totalAssets} verified
            </div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Verified Assets</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-[#111827]">{stats.verifiedAssets}</span>
              <span className="text-[11px] font-semibold text-blue-600">Active</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">Across 8 asset families</div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Pending Reviews</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-[#111827]">{stats.pendingReviews}</span>
              <span className="text-[11px] font-semibold text-amber-600">In Queue</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">SLA: &lt; 24h response</div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Verification Failures</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-emerald-700">0</span>
              <span className="text-[11px] font-semibold text-emerald-600">Healthy</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">0 DNS propagation drops</div>
          </div>

          <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="text-[11px] font-medium text-[#667085]">Trust Issues</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-amber-600">{stats.criticalTrustIssues}</span>
              <span className="text-[11px] font-semibold text-amber-600">Actionable</span>
            </div>
            <div className="mt-2 text-[10px] text-[#98A2B3]">1 Typosquat blocked</div>
          </div>
        </div>
      </div>

      {/* Navigation Segmented Controls */}
      <div className="flex border-b border-[#E7EAF0] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "overview"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Sparkles className="size-4" />
          <span>Trust Score Engine</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("workspace")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "workspace"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Layers className="size-4" />
          <span>Ownership Verification Workspace</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("dns")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "dns"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Globe className="size-4" />
          <span>DNS Cryptographic Verification</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("queue")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "queue"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <FileText className="size-4" />
          <span>Manual Review Queue ({queue.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("integrity")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "integrity"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <ShieldAlert className="size-4" />
          <span>Scope Integrity & Brand Shield</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("integrations")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "integrations"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Plug className="size-4" />
          <span>Integration Health</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("compliance")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "compliance"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <BadgeCheck className="size-4" />
          <span>Compliance & SLAs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("timeline")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all whitespace-nowrap",
            activeTab === "timeline"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-[#667085] hover:text-[#111827]",
          )}
        >
          <Clock className="size-4" />
          <span>Trust Audit Log</span>
        </button>
      </div>

      {/* 2. Overview / Trust Score Breakdown Tab */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left 2 Cols: Trust Score Breakdown Table */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#111827]">Trust Score Component Breakdown</h3>
                  <p className="text-xs text-[#667085]">
                    Continuous evaluation based on cryptographic proof across all 8 perimeter domains.
                  </p>
                </div>
                <span className="text-xs font-bold text-blue-600">Total: 94/100</span>
              </div>

              <div className="space-y-3">
                {stats.breakdown.map((item) => (
                  <div
                    key={item.category}
                    className="rounded-lg border border-[#F2F4F7] bg-[#F9FAFB] p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#111827]">{item.category}</span>
                        <span className="text-[10px] text-[#98A2B3]">({item.weight} weight)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#111827]">{item.score}%</span>
                        <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] font-mono text-[#344054]">
                          {item.verifiedCount} / {item.totalCount}
                        </span>
                      </div>
                    </div>

                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          item.score >= 95
                            ? "bg-emerald-500"
                            : item.score >= 85
                            ? "bg-blue-600"
                            : "bg-amber-500",
                        )}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scope Integrity Summary Box */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-blue-600" />
                <h4 className="font-bold text-sm text-[#111827]">
                  Automatic Brand & Perimeter Shield Active
                </h4>
              </div>
              <p className="text-xs text-[#475467] leading-relaxed">
                Unpatched continuously parses Certificate Transparency logs, newly registered WHOIS feeds, and DNS zone
                delegations. Look-alike domains (such as <code className="text-rose-700 bg-white px-1 rounded">c0molho.io</code>)
                are quarantined from bounty scopes automatically.
              </p>
            </div>
          </div>

          {/* Right Col: Trust Recommendations (Sticky Sidebar) */}
          <div className="space-y-4">
            <div className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-[#111827]">Trust Score Elevators</h4>
                <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold">
                  {recommendations.length} Actionable
                </span>
              </div>
              <p className="text-xs text-[#667085]">
                Complete these actions to reach a perfect 100/100 Trust Score.
              </p>

              <div className="space-y-3 pt-2">
                {recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-xl border border-[#E7EAF0] bg-[#F9FAFB] p-3.5 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[10px] font-bold",
                          rec.priority === "Critical"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-blue-50 text-blue-700 border border-blue-200",
                        )}
                      >
                        {rec.priority} Priority
                      </span>
                      <span className="font-bold text-emerald-600 text-[11px]">
                        +{rec.impactScoreIncrease} pts
                      </span>
                    </div>

                    <div className="font-bold text-[#111827]">{rec.title}</div>
                    <p className="text-[11px] text-[#667085]">{rec.description}</p>

                    <button
                      type="button"
                      onClick={() => handleDismissRec(rec.id)}
                      className="mt-1 w-full rounded-lg bg-white border border-[#E7EAF0] py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:border-blue-200"
                    >
                      {rec.actionLabel} →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Ownership Verification Workspace Tab */}
      {activeTab === "workspace" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-[#111827]">
                Perimeter Ownership Verification Workspace
              </h3>
              <p className="text-xs text-[#667085]">
                Assets classified by technology tier with proof attestation status.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedAssetType}
                onChange={(e) => setSelectedAssetType(e.target.value)}
                className="rounded-lg border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] focus:outline-none focus:ring-2 focus:ring-blue-500/10"
              >
                <option value="all">All 8 Asset Types</option>
                <option value="domains">Web Domains & FQDNs</option>
                <option value="repositories">Source Repositories</option>
                <option value="mobile">Mobile Apps</option>
                <option value="cloud">Cloud Projects</option>
                <option value="apis">API Gateways</option>
                <option value="ai">AI Models</option>
                <option value="hardware">Hardware Keys</option>
                <option value="desktop">Desktop Apps</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredGroups.map((grp) => (
              <div
                key={grp.id}
                className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-[#111827]">{grp.label}</h4>
                    <p className="text-xs text-[#667085] mt-0.5">{grp.description}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-[#344054]">
                    {grp.verified}/{grp.total} Verified
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2">
                    <span className="text-[10px] text-emerald-700 font-medium">Verified</span>
                    <div className="font-bold text-emerald-800 text-sm mt-0.5">{grp.verified}</div>
                  </div>
                  <div className="rounded-lg bg-amber-50 border border-amber-100 p-2">
                    <span className="text-[10px] text-amber-700 font-medium">Pending</span>
                    <div className="font-bold text-amber-800 text-sm mt-0.5">{grp.pending}</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 border border-blue-100 p-2">
                    <span className="text-[10px] text-blue-700 font-medium">Review</span>
                    <div className="font-bold text-blue-800 text-sm mt-0.5">{grp.needsReview}</div>
                  </div>
                  <div className="rounded-lg bg-slate-100 border border-slate-200 p-2">
                    <span className="text-[10px] text-slate-700 font-medium">Expired</span>
                    <div className="font-bold text-slate-800 text-sm mt-0.5">{grp.expired}</div>
                  </div>
                </div>

                {/* Asset Items List */}
                <div className="space-y-1.5 pt-2 border-t border-[#F2F4F7]">
                  {grp.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-[#F2F4F7] bg-[#F9FAFB] p-2.5 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#111827] truncate">{item.name}</span>
                          <span className="font-mono text-[10px] text-[#667085]">{item.method}</span>
                        </div>
                        <div className="text-[11px] text-[#98A2B3] truncate">{item.identifier}</div>
                      </div>

                      <span
                        className={cn(
                          "shrink-0 rounded px-2 py-0.5 text-[10px] font-bold",
                          item.status === "verified"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.status === "pending"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-800",
                        )}
                      >
                        {item.status.replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. DNS Verification Dedicated Tab */}
      {activeTab === "dns" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                    DNS Cryptographic Proof Verified
                  </span>
                  <span className="text-xs text-[#667085]">Checked {dnsStatus.lastChecked}</span>
                </div>
                <h3 className="mt-2 text-xl font-bold text-[#111827]">
                  Authoritative DNS TXT Challenge
                </h3>
                <p className="text-xs text-[#667085]">
                  Proves ownership of apex domain <strong className="text-[#111827]">{dnsStatus.domain}</strong> and
                  all subordinate wildcard subdomains.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTriggerDNSCheck}
                  disabled={isVerifyingDNS}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <RefreshCw className={cn("size-3.5", isVerifyingDNS && "animate-spin")} />
                  <span>{isVerifyingDNS ? "Querying Nameservers..." : "Re-Check TXT Record"}</span>
                </button>
              </div>
            </div>

            {/* DNS Records Box */}
            <div className="space-y-3 rounded-xl border border-[#E7EAF0] bg-[#F9FAFB] p-4 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-[#667085] font-sans font-semibold">Record Host / Name:</span>
                <div className="flex items-center justify-between rounded-lg bg-white border border-[#E7EAF0] px-3 py-2 text-[#111827]">
                  <span>{dnsStatus.txtRecordName}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(dnsStatus.txtRecordName, "host")}
                    className="font-sans text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {copiedKey === "host" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[#667085] font-sans font-semibold">Record Type:</span>
                <div className="rounded-lg bg-white border border-[#E7EAF0] px-3 py-2 text-[#111827]">
                  TXT
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[#667085] font-sans font-semibold">Cryptographic Token Value:</span>
                <div className="flex items-center justify-between rounded-lg bg-white border border-[#E7EAF0] px-3 py-2 text-[#111827]">
                  <span className="break-all">{dnsStatus.txtRecordValue}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(dnsStatus.txtRecordValue, "token")}
                    className="font-sans text-xs text-blue-600 hover:text-blue-700 font-medium ml-2"
                  >
                    {copiedKey === "token" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>

            {/* Explanatory Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded-xl border border-[#E7EAF0] p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-[#111827]">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Subdomains Inherited
                </div>
                <p className="text-[#667085] text-[11.5px] leading-relaxed">
                  Verifying <code className="text-[#111827]">comolho.io</code> automatically authorizes wildcard
                  assets like <code className="text-[#111827]">*.comolho.io</code> without individual records.
                </p>
              </div>

              <div className="rounded-xl border border-[#E7EAF0] p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-[#111827]">
                  <ShieldAlert className="size-4 text-rose-600" />
                  Look-alike Domains Rejected
                </div>
                <p className="text-[#667085] text-[11.5px] leading-relaxed">
                  Similar or homoglyph domains submitted by third parties are quarantined immediately to prevent
                  unauthorized bounty testing.
                </p>
              </div>

              <div className="rounded-xl border border-[#E7EAF0] p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-[#111827]">
                  <AlertTriangle className="size-4 text-amber-600" />
                  De-Verification Protection
                </div>
                <p className="text-[#667085] text-[11.5px] leading-relaxed">
                  If the TXT token is removed, all associated program scopes enter a 48-hour grace period before being
                  paused.
                </p>
              </div>
            </div>

            {/* DNS Check History */}
            <div className="space-y-2 pt-2 border-t border-[#F2F4F7]">
              <h4 className="font-bold text-xs text-[#111827]">Automated Hourly Verification History:</h4>
              <div className="space-y-1.5">
                {dnsStatus.history.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-[#F2F4F7] bg-[#F9FAFB] p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                      <span className="text-[#475467]">{h.event}</span>
                    </div>
                    <span className="text-[11px] text-[#98A2B3] shrink-0 ml-2">{h.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Manual Verification Queue Tab */}
      {activeTab === "queue" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Manual Ownership Attestation Queue</h3>
              <p className="text-xs text-[#667085]">
                Review evidence submitted for IP ranges, proprietary mobile apps, AI models, and internal repositories.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {queue.map((req) => (
              <div
                key={req.id}
                className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 border border-blue-200/50">
                      {req.assetType}
                    </span>
                    <h4 className="font-bold text-sm text-[#111827]">{req.assetName}</h4>
                    <span className="text-xs font-mono text-[#667085]">({req.targetIdentifier})</span>
                  </div>

                  <span
                    className={cn(
                      "rounded px-2.5 py-0.5 text-[10px] font-bold w-max",
                      req.status === "approved"
                        ? "bg-emerald-50 text-emerald-700"
                        : req.status === "rejected"
                        ? "bg-red-50 text-red-700"
                        : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {req.status.replace("_", " ").toUpperCase()}
                  </span>
                </div>

                <div className="rounded-lg border border-[#F2F4F7] bg-[#F9FAFB] p-3 text-xs space-y-1">
                  <div className="font-semibold text-[#111827]">
                    Evidence Type: <span className="text-blue-700">{req.evidenceType}</span>
                  </div>
                  <p className="text-[#475467] font-mono text-[11.5px]">{req.evidenceSnippet}</p>
                  {req.reviewNotes && (
                    <p className="text-amber-800 text-[11px] pt-1 border-t border-[#E7EAF0]">
                      Reviewer Note: {req.reviewNotes}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs pt-2 border-t border-[#F2F4F7]">
                  <span className="text-[#98A2B3]">
                    Submitted by {req.requesterName} ({req.requesterEmail}) • Assigned to {req.assignedReviewer}
                  </span>

                  <div className="flex items-center gap-2">
                    {req.status === "pending_review" && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApproveQueue(req.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                          Approve Ownership
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectQueue(req.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Scope Integrity Tab */}
      {activeTab === "integrity" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-[#111827]">Scope Integrity & Brand Protection Shield</h3>
            <p className="text-xs text-[#667085]">
              Real-time monitoring of scope drift, lookalike typosquatting domains, and unauthorized additions.
            </p>
          </div>

          <div className="space-y-3">
            {MOCK_SCOPE_INTEGRITY_ITEMS.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-2.5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                        item.severity === "critical"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : item.severity === "high"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200",
                      )}
                    >
                      {item.severity} Risk
                    </span>
                    <h4 className="font-bold text-sm text-[#111827]">{item.title}</h4>
                  </div>
                  <span className="text-xs text-[#98A2B3]">{item.detectedAt}</span>
                </div>

                <p className="text-xs text-[#475467]">{item.description}</p>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg bg-[#F9FAFB] p-2.5 text-xs border border-[#F2F4F7]">
                  <span className="text-[#667085]">
                    <strong className="text-[#111827]">Target:</strong> {item.affectedAsset}
                  </span>
                  <span className="font-semibold text-blue-700">{item.recommendedAction}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Integration Health Tab */}
      {activeTab === "integrations" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#111827]">Enterprise Integration Ecosystem Health</h3>
              <p className="text-xs text-[#667085]">
                Verification webhooks, bi-directional issue tracking synchronization, and alert delivery.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {MOCK_INTEGRATION_HEALTH.map((int) => (
              <div
                key={int.id}
                className="rounded-xl border border-[#E7EAF0] bg-white p-5 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {int.category}
                    </span>
                    <h4 className="mt-1 font-bold text-sm text-[#111827]">{int.name}</h4>
                  </div>

                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-bold",
                      int.healthy
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {int.healthy ? "HEALTHY (100%)" : "DISCONNECTED"}
                  </span>
                </div>

                <p className="text-xs text-[#667085]">{int.syncSummary}</p>

                <div className="grid grid-cols-3 gap-2 text-center text-xs rounded-lg bg-[#F9FAFB] p-2 border border-[#F2F4F7]">
                  <div>
                    <span className="text-[10px] text-[#98A2B3]">Uptime</span>
                    <div className="font-bold text-[#111827] mt-0.5">{int.uptimePercentage}%</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#98A2B3]">Latency</span>
                    <div className="font-bold text-[#111827] mt-0.5">{int.latencyMs}ms</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#98A2B3]">Last Sync</span>
                    <div className="font-bold text-[#111827] mt-0.5">{int.lastSync}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8. Compliance & SLAs Tab */}
      {activeTab === "compliance" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#E7EAF0] bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-[#111827]">Organization Trust & Compliance Posture</h3>
            <p className="text-xs text-[#667085]">
              Attestations certified by Unpatched Security platform policies for bug bounty program governance.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
              <div className="rounded-xl border border-[#E7EAF0] p-4 space-y-2">
                <span className="text-xs font-bold text-[#111827]">Verification SLA</span>
                <div className="text-2xl font-black text-emerald-600">99.4%</div>
                <p className="text-[11px] text-[#667085]">
                  Automated re-check cadence every 3,600s with multi-region nameserver query distribution.
                </p>
              </div>

              <div className="rounded-xl border border-[#E7EAF0] p-4 space-y-2">
                <span className="text-xs font-bold text-[#111827]">Manual Review SLA</span>
                <div className="text-2xl font-black text-blue-600">&lt; 14h avg</div>
                <p className="text-[11px] text-[#667085]">
                  Owner verification requests processed within 24 hours guaranteed.
                </p>
              </div>

              <div className="rounded-xl border border-[#E7EAF0] p-4 space-y-2">
                <span className="text-xs font-bold text-[#111827]">Audit Readiness</span>
                <div className="text-2xl font-black text-purple-600">SOC2 Type II</div>
                <p className="text-[11px] text-[#667085]">
                  Full tamper-evident audit history retained for 7 years for enterprise compliance.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. Trust Audit Log Tab */}
      {activeTab === "timeline" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-[#111827]">Trust Center Audit Timeline</h3>
            <p className="text-xs text-[#667085]">
              Every cryptographic verification, attestation change, and score update recorded with actor provenance.
            </p>
          </div>

          <div className="relative border-l border-[#E7EAF0] ml-3.5 space-y-5 py-2">
            {MOCK_TRUST_AUDIT_TIMELINE.map((event) => (
              <div key={event.id} className="relative pl-6">
                <span className="absolute -left-1.5 top-1 size-3 rounded-full bg-blue-600 ring-4 ring-white" />
                <div className="rounded-xl border border-[#E7EAF0] bg-white p-3.5 shadow-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#111827]">{event.action}</span>
                    <span className="text-[11px] text-[#98A2B3]">{event.timestamp}</span>
                  </div>
                  <div className="text-xs text-[#475467]">
                    Target: <span className="font-semibold text-[#111827]">{event.target}</span> • Actor: {event.actor}
                  </div>
                  <p className="text-xs text-[#667085]">{event.details}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
