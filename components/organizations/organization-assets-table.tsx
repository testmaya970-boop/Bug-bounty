"use client";

import React, { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Checkbox, Select } from "../ui/form";
import { Button } from "../ui/button";
import { ErrorState, EmptyState, Skeleton } from "../ui/feedback";
import { AssetTypeBadge } from "../ui/badge";
import { assetTypeLabel } from "../../lib/scope-labels";
import { listOrganizationAssetsPageAction } from "../../actions/scope";
import type { AssetInventoryItem, ProgramAssetType } from "../../types/scope";
import { LocalTime } from "../ui/local-time";
import { AssetRewardGroupSelect } from "../rewards/reward-groups";
import type { RewardColor, RewardIcon, RewardGroup } from "../../types/reward-groups";
import { getAssetIntelligence, type AssetIntelligence } from "../../lib/assets-intelligence";
import {
  Search,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  Flame,
  ExternalLink,
  ChevronRight,
  Server,
  Globe,
  Radio,
  Lock,
  Cpu,
  Smartphone,
  Code2,
  FileText,
  AlertCircle,
  X,
  Filter,
  Layers,
  ArrowUpRight,
  Info
} from "lucide-react";

const FILTERABLE_TYPES: ProgramAssetType[] = [
  "domain",
  "url",
  "ip_cidr",
  "ios_app",
  "android_app",
  "source_code",
  "hardware",
  "ai_model",
];

export function OrganizationAssetsTable({
  organizationId,
  initialAssets,
  groupByAsset = {},
  rewardGroups = [],
  canEditGroup = false,
  initialNextCursor,
  programId,
  assetType,
  includeRetired,
  programOptions,
}: {
  organizationId: string;
  initialAssets: AssetInventoryItem[];
  groupByAsset?: Record<string, string | null>;
  rewardGroups?: { id: string; name: string; color: RewardColor; icon: RewardIcon }[];
  canEditGroup?: boolean;
  initialNextCursor: string | null;
  programId: string | "all";
  assetType: ProgramAssetType | "all";
  includeRetired: boolean;
  programOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [assets, setAssets] = useState<AssetInventoryItem[]>(initialAssets);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [filterPending, startFilterTransition] = useTransition();

  // Selected asset for right-hand intelligence panel
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(
    initialAssets.length > 0 ? initialAssets[0].id : null,
  );

  // Client-side quick search & chip filter
  const [searchQuery, setSearchQuery] = useState("");
  const [activeChip, setActiveChip] = useState<"all" | "high_risk" | "public_ingress" | "crown_jewels" | "has_findings">("all");

  // Mobile drawer state
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function navigateWithFilters(next: {
    programId?: string | "all";
    assetType?: ProgramAssetType | "all";
    includeRetired?: boolean;
  }) {
    const params = new URLSearchParams();
    const nextProgramId = next.programId ?? programId;
    const nextAssetType = next.assetType ?? assetType;
    if (nextProgramId !== "all") params.set("program", nextProgramId);
    if (nextAssetType !== "all") params.set("type", nextAssetType);
    if (next.includeRetired ?? includeRetired) params.set("retired", "1");
    const query = params.toString();
    startFilterTransition(() => {
      router.push((`/organizations/${organizationId}/assets` + (query ? `?${query}` : "")) as Route);
    });
  }

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadError(null);
    startTransition(async () => {
      const result = await listOrganizationAssetsPageAction({
        organizationId,
        cursor: nextCursor,
        programId: programId === "all" ? undefined : programId,
        assetType: assetType === "all" ? undefined : assetType,
        includeRetired,
      });
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setAssets((current) => [...current, ...result.data.items]);
      setNextCursor(result.data.nextCursor);
    });
  }

  // Precompute intelligences for quick lookups
  const rewardGroupMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: RewardColor; icon: RewardIcon }>();
    for (const g of rewardGroups) map.set(g.id, g);
    return map;
  }, [rewardGroups]);

  const intelligenceMap = useMemo(() => {
    const map = new Map<string, AssetIntelligence>();
    for (const a of assets) {
      const g = groupByAsset[a.id] ? rewardGroupMap.get(groupByAsset[a.id]!) : null;
      // Adapt reward group format
      const rg: RewardGroup | null = g
        ? {
            id: g.id,
            name: g.name,
            description: "",
            color: g.color,
            icon: g.icon,
            currency: "USD",
            isDefault: false,
            archived: false,
            assetCount: 0,
            bounties: g.id.includes("tier-1")
              ? { critical: { min: 1000000, max: 2500000 } }
              : g.id.includes("tier-2")
                ? { critical: { min: 500000, max: 1200000 } }
                : { critical: { min: 150000, max: 350000 } },
          }
        : null;
      map.set(a.id, getAssetIntelligence(a, rg));
    }
    return map;
  }, [assets, groupByAsset, rewardGroupMap]);

  // Filtered assets by search query and quick chips
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const intel = intelligenceMap.get(asset.id);
      if (!intel) return true;

      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTarget = asset.displayIdentifier.toLowerCase().includes(q);
        const matchesOwner = intel.ownerTeam.toLowerCase().includes(q);
        const matchesTech = intel.techStack.some((t) => t.toLowerCase().includes(q));
        const matchesExposure = intel.exposureType.toLowerCase().includes(q);
        const matchesTags = intel.complianceTags.some((t) => t.toLowerCase().includes(q));
        if (!matchesTarget && !matchesOwner && !matchesTech && !matchesExposure && !matchesTags) {
          return false;
        }
      }

      // Quick chip filter
      if (activeChip === "high_risk") {
        return intel.riskSeverity === "critical" || intel.riskSeverity === "high";
      }
      if (activeChip === "public_ingress") {
        return intel.exposureType === "Public Ingress" || intel.exposureType === "Edge Anycast";
      }
      if (activeChip === "crown_jewels") {
        return intel.complianceTags.includes("Crown Jewel");
      }
      if (activeChip === "has_findings") {
        return asset.openReports > 0;
      }

      return true;
    });
  }, [assets, intelligenceMap, searchQuery, activeChip]);

  // Active selected asset
  const selectedAsset = useMemo(() => {
    if (!selectedAssetId) return filteredAssets[0] || assets[0] || null;
    return assets.find((a) => a.id === selectedAssetId) || filteredAssets[0] || assets[0] || null;
  }, [selectedAssetId, assets, filteredAssets]);

  const selectedIntel = selectedAsset ? intelligenceMap.get(selectedAsset.id) : null;
  const hasActiveFilter = programId !== "all" || assetType !== "all" || includeRetired || searchQuery !== "" || activeChip !== "all";

  // Type Icon helper
  function getTypeIcon(type: ProgramAssetType) {
    switch (type) {
      case "url":
        return <Globe className="size-4 text-[#2563EB]" />;
      case "domain":
        return <Server className="size-4 text-[#7C3AED]" />;
      case "ip_cidr":
        return <Radio className="size-4 text-[#0891B2]" />;
      case "ios_app":
      case "android_app":
        return <Smartphone className="size-4 text-[#059669]" />;
      case "source_code":
        return <Code2 className="size-4 text-[#D97706]" />;
      default:
        return <Cpu className="size-4 text-[#475467]" />;
    }
  }

  return (
    <div className="space-y-5">
      {/* Search & Control Filter Bar */}
      <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Dominant Search Input */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#667085]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by hostname, IP address, CIDR, technology, or owner..."
              className="w-full rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] py-2.5 pl-10 pr-10 text-sm text-[#111827] placeholder:text-[#667085] focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#667085] hover:text-[#111827]"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Wrap-safe Select Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="min-w-[160px] flex-1 sm:flex-initial">
              <select
                disabled={filterPending}
                value={programId}
                onChange={(e) => navigateWithFilters({ programId: e.target.value })}
                className="w-full rounded-xl border border-[#E7EAF0] bg-[#FFFFFF] px-3 py-2 text-xs font-medium text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
              >
                <option value="all">All engagements</option>
                {programOptions.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[130px] flex-1 sm:flex-initial">
              <select
                disabled={filterPending}
                value={assetType}
                onChange={(e) => navigateWithFilters({ assetType: e.target.value as ProgramAssetType | "all" })}
                className="w-full rounded-xl border border-[#E7EAF0] bg-[#FFFFFF] px-3 py-2 text-xs font-medium text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
              >
                <option value="all">All asset types</option>
                {FILTERABLE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {assetTypeLabel(type)}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-1.5 rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#475467] hover:bg-[#F1F5F9] cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={includeRetired}
                disabled={filterPending}
                onChange={(e) => navigateWithFilters({ includeRetired: e.target.checked })}
                className="size-3.5 rounded border-[#D0D5DD] text-[#2563EB] focus:ring-[#2563EB]"
              />
              <span>Retired</span>
            </label>

            {filterPending && (
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-[#2563EB] border-r-transparent text-[#2563EB]"
              />
            )}
          </div>
        </div>

        {/* Quick Filter Chips */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#F1F5F9] pt-3 text-xs">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-[#667085]">Quick View:</span>
          {[
            { id: "all", label: `All Targets (${assets.length})` },
            { id: "high_risk", label: "High Risk Only" },
            { id: "public_ingress", label: "Public Ingress" },
            { id: "crown_jewels", label: "Crown Jewels" },
            { id: "has_findings", label: "With Open Findings" },
          ].map((chip) => {
            const isActive = activeChip === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setActiveChip(chip.id as typeof activeChip)}
                className={`rounded-full px-3 py-1 font-medium transition-all ${
                  isActive
                    ? "bg-[#111827] text-[#FFFFFF] shadow-sm"
                    : "bg-[#F1F5F9] text-[#475467] hover:bg-[#E2E8F0] hover:text-[#111827]"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Two-Column Attack Surface Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_390px] xl:grid-cols-[1fr_430px]">
        {/* Left Column: Asset Inventory List */}
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#667085]">
              Showing {filteredAssets.length} of {assets.length} Assets
            </span>
            <span className="text-xs text-[#667085]">
              Click any target to inspect security intelligence
            </span>
          </div>

          {filteredAssets.length === 0 ? (
            <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-8">
              <EmptyState title="No matching assets found">
                No target matches the current search or filters. Try clearing your filters or search terms.
              </EmptyState>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredAssets.map((asset) => {
                const intel = intelligenceMap.get(asset.id)!;
                const isSelected = selectedAsset?.id === asset.id;
                const isCrownJewel = intel.complianceTags.includes("Crown Jewel");

                return (
                  <div
                    key={asset.id}
                    onClick={() => {
                      setSelectedAssetId(asset.id);
                      setIsMobileDrawerOpen(true);
                    }}
                    className={`group relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                      isSelected
                        ? "border-[#2563EB] bg-[#EFF6FF]/40 shadow-[0_4px_16px_rgba(37,99,235,0.08)] ring-1 ring-[#2563EB]"
                        : "border-[#E7EAF0] bg-[#FFFFFF] hover:border-[#CBD5E1] hover:bg-[#F8FAFC] shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                    }`}
                  >
                    <div className="flex flex-col gap-3">
                      {/* Top Row: Type, Target, Copy, Risk Badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 rounded-lg border border-[#E7EAF0] bg-[#F8FAFC] p-1.5 shrink-0">
                            {getTypeIcon(asset.assetType)}
                          </span>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-sm font-semibold text-[#111827] [overflow-wrap:anywhere]">
                                {asset.displayIdentifier}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(asset.displayIdentifier, asset.id);
                                }}
                                className="rounded p-1 text-[#667085] hover:bg-[#F1F5F9] hover:text-[#111827]"
                                title="Copy target"
                              >
                                {copiedId === asset.id ? (
                                  <Check className="size-3.5 text-[#059669]" />
                                ) : (
                                  <Copy className="size-3.5" />
                                )}
                              </button>
                            </div>

                            <p className="mt-0.5 text-xs text-[#667085]">
                              {intel.ownerTeam} · {intel.cloudEnvironment}
                            </p>
                          </div>
                        </div>

                        {/* Risk Score Pill */}
                        <div className="flex shrink-0 items-center gap-2">
                          <div
                            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                              intel.riskSeverity === "critical"
                                ? "bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]"
                                : intel.riskSeverity === "high"
                                  ? "bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]"
                                  : intel.riskSeverity === "medium"
                                    ? "bg-[#FEFCE8] text-[#CA8A04] border border-[#FEF08A]"
                                    : "bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]"
                            }`}
                          >
                            {intel.riskSeverity === "critical" && <Flame className="size-3" />}
                            <span>Risk {intel.riskScore}</span>
                          </div>
                        </div>
                      </div>

                      {/* Middle Row: Exposure pill, Verification, Scope badges, Reward Group */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {/* Exposure Badge */}
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-[#475467]">
                          <Globe className="size-3 text-[#64748B]" />
                          {intel.exposureType}
                        </span>

                        {/* Verification Check */}
                        {intel.verificationStatus === "verified" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-medium text-[#059669]">
                            <ShieldCheck className="size-3" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#F8FAFC] px-2 py-0.5 text-[11px] font-medium text-[#64748B]">
                            {intel.verificationStatus === "retired" ? "Retired" : "Unverified"}
                          </span>
                        )}

                        {/* Crown Jewel */}
                        {isCrownJewel && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#F3E8FF] px-2 py-0.5 text-[11px] font-semibold text-[#7C3AED]">
                            Crown Jewel
                          </span>
                        )}

                        {/* Reward Group Select */}
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="ml-auto flex items-center"
                        >
                          <AssetRewardGroupSelect
                            organizationId={organizationId}
                            assetId={asset.id}
                            assetName={asset.displayIdentifier}
                            groupId={groupByAsset[asset.id] ?? null}
                            groups={rewardGroups}
                            canEdit={canEditGroup}
                          />
                        </div>
                      </div>

                      {/* Bottom Row: Program scopes, findings counter & inspect CTA */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F1F5F9] pt-2.5 text-xs text-[#667085]">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          {asset.programs.length === 0 ? (
                            <span className="text-[11px] text-[#98A2B3]">Retired: not in any active scope</span>
                          ) : (
                            asset.programs.map((prog) => (
                              <span
                                key={prog.program_id}
                                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                  prog.scope_state === "in_scope"
                                    ? "bg-[#F1F5F9] text-[#111827]"
                                    : "bg-[#F8FAFC] text-[#98A2B3] line-through"
                                }`}
                              >
                                {prog.program_name}
                              </span>
                            ))
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          {asset.openReports > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF2F2] px-2 py-0.5 text-[11px] font-bold text-[#DC2626]">
                              <span className="size-1.5 rounded-full bg-[#DC2626] animate-pulse" />
                              {asset.openReports} open finding{asset.openReports > 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#059669] font-medium">
                              0 open findings
                            </span>
                          )}

                          <span className="flex items-center text-[11px] font-medium text-[#2563EB] group-hover:underline">
                            Inspect
                            <ChevronRight className="ml-0.5 size-3" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pending && (
            <div className="space-y-2 rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-4" role="status">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          )}

          {loadError && (
            <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
              <ErrorState>{loadError}</ErrorState>
            </div>
          )}

          {nextCursor ? (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" pending={pending} onClick={handleLoadMore}>
                Load more assets
              </Button>
            </div>
          ) : (
            filteredAssets.length > 0 && (
              <p className="py-2 text-center text-xs text-[#667085]">
                All assets in inventory loaded ({filteredAssets.length} displayed).
              </p>
            )
          )}
        </div>

        {/* Right Column: Sticky Contextual Intelligence Panel (Desktop) */}
        <div className="hidden lg:block">
          <div className="sticky top-6">
            {selectedAsset && selectedIntel ? (
              <AssetProfileCard
                organizationId={organizationId}
                asset={selectedAsset}
                intel={selectedIntel}
                rewardGroup={
                  groupByAsset[selectedAsset.id]
                    ? rewardGroupMap.get(groupByAsset[selectedAsset.id]!)
                    : null
                }
                onCopy={handleCopy}
                copiedId={copiedId}
              />
            ) : (
              <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-6 text-center text-sm text-[#667085]">
                Select an asset from the inventory list to view attack surface intelligence.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile / Tablet Drawer for Selected Asset Profile */}
      {isMobileDrawerOpen && selectedAsset && selectedIntel && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm lg:hidden">
          <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-[#E7EAF0] bg-[#FFFFFF] p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-[#F1F5F9] pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                Asset Intelligence Profile
              </span>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="rounded-full bg-[#F1F5F9] p-1.5 text-[#475467] hover:bg-[#E2E8F0]"
              >
                <X className="size-4" />
              </button>
            </div>
            <AssetProfileCard
              organizationId={organizationId}
              asset={selectedAsset}
              intel={selectedIntel}
              rewardGroup={
                groupByAsset[selectedAsset.id]
                  ? rewardGroupMap.get(groupByAsset[selectedAsset.id]!)
                  : null
              }
              onCopy={handleCopy}
              copiedId={copiedId}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Reusable Right-Hand Intelligence Profile Card
 */
function AssetProfileCard({
  organizationId,
  asset,
  intel,
  rewardGroup,
  onCopy,
  copiedId,
}: {
  organizationId: string;
  asset: AssetInventoryItem;
  intel: AssetIntelligence;
  rewardGroup?: { id: string; name: string; color: RewardColor; icon: RewardIcon } | null;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
}) {
  return (
    <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] space-y-5">
      {/* Profile Header */}
      <div>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#667085]">
            <Server className="size-3 text-[#2563EB]" />
            Attack Surface Target
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
              intel.verificationStatus === "verified"
                ? "bg-[#ECFDF5] text-[#059669]"
                : "bg-[#F8FAFC] text-[#64748B]"
            }`}
          >
            {intel.verificationStatus}
          </span>
        </div>

        <div className="mt-2 flex items-start justify-between gap-2">
          <h2 className="font-mono text-base font-bold text-[#111827] [overflow-wrap:anywhere]">
            {asset.displayIdentifier}
          </h2>
          <button
            type="button"
            onClick={() => onCopy(asset.displayIdentifier, `intel-${asset.id}`)}
            className="rounded-lg border border-[#E7EAF0] bg-[#F8FAFC] p-1.5 text-[#667085] hover:bg-[#F1F5F9] hover:text-[#111827] shrink-0"
            title="Copy target"
          >
            {copiedId === `intel-${asset.id}` ? (
              <Check className="size-3.5 text-[#059669]" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>

        <p className="mt-1 text-xs text-[#475467] leading-relaxed">
          {intel.exposureDescription}
        </p>
      </div>

      {/* Attack Surface Risk Gauge */}
      <div className="rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#111827]">Security Risk Score</span>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase ${
              intel.riskSeverity === "critical"
                ? "bg-[#FEF2F2] text-[#DC2626]"
                : intel.riskSeverity === "high"
                  ? "bg-[#FFFBEB] text-[#D97706]"
                  : intel.riskSeverity === "medium"
                    ? "bg-[#FEFCE8] text-[#CA8A04]"
                    : "bg-[#ECFDF5] text-[#059669]"
            }`}
          >
            {intel.riskSeverity} Risk ({intel.riskScore}/100)
          </span>
        </div>

        {/* Visual Score Bar */}
        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              intel.riskSeverity === "critical"
                ? "bg-[#DC2626]"
                : intel.riskSeverity === "high"
                  ? "bg-[#F59E0B]"
                  : intel.riskSeverity === "medium"
                    ? "bg-[#EAB308]"
                    : "bg-[#10B981]"
            }`}
            style={{ width: `${intel.riskScore}%` }}
          />
        </div>

        {/* Risk Factors */}
        {intel.riskFactors.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-[#475467]">
            {intel.riskFactors.map((factor, idx) => (
              <li key={idx} className="flex items-center gap-1.5">
                <AlertCircle className="size-3.5 text-[#D97706] shrink-0" />
                <span>{factor}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Exposure & Telemetry Details */}
      <div className="space-y-3 text-xs">
        <h4 className="font-semibold uppercase tracking-wider text-[11px] text-[#667085]">
          Infrastructure & Ownership
        </h4>

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#E7EAF0] p-3 bg-[#FFFFFF]">
          <div>
            <span className="text-[10px] uppercase font-semibold text-[#667085]">Owner Team</span>
            <p className="mt-0.5 font-medium text-[#111827]">{intel.ownerTeam}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-[#667085]">Contact</span>
            <p className="mt-0.5 font-mono text-[11px] text-[#111827] truncate">{intel.primaryContact}</p>
          </div>
          <div className="mt-2">
            <span className="text-[10px] uppercase font-semibold text-[#667085]">Environment</span>
            <p className="mt-0.5 font-medium text-[#111827]">{intel.cloudEnvironment}</p>
          </div>
          <div className="mt-2">
            <span className="text-[10px] uppercase font-semibold text-[#667085]">Region / Route</span>
            <p className="mt-0.5 font-medium text-[#111827]">{intel.region}</p>
          </div>
        </div>

        {/* Ports & Protocols */}
        <div>
          <span className="text-[11px] font-semibold text-[#475467]">Ports & Listeners:</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {intel.portsProtocols.map((port, idx) => (
              <span key={idx} className="rounded bg-[#F1F5F9] px-2 py-0.5 font-mono text-[11px] text-[#334155]">
                {port}
              </span>
            ))}
          </div>
        </div>

        {/* Tech Stack Chips */}
        <div>
          <span className="text-[11px] font-semibold text-[#475467]">Technology Stack:</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {intel.techStack.map((tech, idx) => (
              <span key={idx} className="rounded-md border border-[#E7EAF0] bg-[#F8FAFC] px-2 py-0.5 text-[11px] font-medium text-[#111827]">
                {tech}
              </span>
            ))}
          </div>
        </div>

        {/* Compliance Tags */}
        <div>
          <span className="text-[11px] font-semibold text-[#475467]">Compliance Scope:</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {intel.complianceTags.map((tag, idx) => (
              <span
                key={idx}
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                  tag === "Crown Jewel"
                    ? "bg-[#F3E8FF] text-[#7C3AED] border border-[#E9D5FF]"
                    : "bg-[#F1F5F9] text-[#475467]"
                }`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Associated Vulnerability Findings */}
      <div className="border-t border-[#F1F5F9] pt-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
            Vulnerability Findings ({intel.openFindingsCount} Open)
          </span>
          <Link
            href={`/organizations/${organizationId}/findings?search=${encodeURIComponent(asset.displayIdentifier)}` as Route}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#2563EB] hover:underline"
          >
            Findings Hub
            <ArrowUpRight className="size-3" />
          </Link>
        </div>

        {intel.simulatedFindings.length > 0 ? (
          <div className="space-y-2">
            {intel.simulatedFindings.map((f) => (
              <div key={f.id} className="rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      f.severity === "critical"
                        ? "bg-[#FEF2F2] text-[#DC2626]"
                        : "bg-[#FFFBEB] text-[#D97706]"
                    }`}
                  >
                    {f.severity} · CVSS {f.cvss}
                  </span>
                  <span className="text-[10px] text-[#667085]">{f.submittedAgo}</span>
                </div>
                <p className="mt-1 font-medium text-[#111827] line-clamp-2">{f.title}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-[#F0FDF4] p-3 text-xs text-[#16A34A]">
            <ShieldCheck className="size-4 shrink-0" />
            <span>No unresolved vulnerabilities currently reported on this target.</span>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="border-t border-[#F1F5F9] pt-3 flex flex-col gap-2">
        <Link
          href={`/organizations/${organizationId}/findings?search=${encodeURIComponent(asset.displayIdentifier)}` as Route}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#111827] px-4 py-2.5 text-xs font-semibold text-[#FFFFFF] hover:bg-[#1F2937] transition-colors"
        >
          <Filter className="size-3.5" />
          Filter Findings for this Asset
        </Link>
      </div>
    </div>
  );
}
