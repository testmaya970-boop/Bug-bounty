"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { PublicLeaderboardRow } from "../../types/reputation";
import {
  enrichLeaderboardRow,
  calculateLeaderboardSummary,
  type EnrichedLeaderboardRow,
  type ResearcherSpecialization,
  type LeaderboardTimeRange,
} from "../../lib/researcher-leaderboard-intelligence";
import { ResearcherPreviewDrawer } from "./researcher-preview-drawer";
import {
  Search,
  Trophy,
  Flame,
  TrendingUp,
  ShieldCheck,
  Award,
  Zap,
  Globe,
  Star,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  Clock,
  ArrowUp,
  ArrowDown,
  Minus,
  X,
  Sparkles,
  Info,
  Medal,
  Eye
} from "lucide-react";

export function LeaderboardTable({
  rows,
  myResearcherId,
}: {
  rows: PublicLeaderboardRow[];
  myResearcherId?: string;
}) {
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState<LeaderboardTimeRange>("all_time");
  const [activeTab, setActiveTab] = useState<ResearcherSpecialization>("overall");
  const [selectedResearcherId, setSelectedResearcherId] = useState<string | null>(null);

  // Profile Preview Drawer state
  const [previewResearcher, setPreviewResearcher] = useState<EnrichedLeaderboardRow | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  function handleOpenPreview(researcher: EnrichedLeaderboardRow) {
    setPreviewResearcher(researcher);
    setIsPreviewOpen(true);
  }

  // 1. Enrich all rows with deterministic reputation intelligence
  const enrichedRows = useMemo(() => {
    return rows.map((row, idx) => enrichLeaderboardRow(row, idx));
  }, [rows]);

  // 2. Calculate Top 6 Summary KPI Cards
  const summary = useMemo(() => {
    return calculateLeaderboardSummary(enrichedRows);
  }, [enrichedRows]);

  // 3. Filter rows based on search, time range, and specialization tab
  const visibleRows = useMemo(() => {
    return enrichedRows.filter((row) => {
      // Search filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesName = row.displayName.toLowerCase().includes(q);
        const matchesUsername = row.username.toLowerCase().includes(q);
        const matchesTags = row.tags.some((t) => t.toLowerCase().includes(q));
        const matchesCountry = row.country.name.toLowerCase().includes(q);
        if (!matchesName && !matchesUsername && !matchesTags && !matchesCountry) {
          return false;
        }
      }

      // Specialization tab filter
      if (activeTab === "web") return row.specialization === "web";
      if (activeTab === "api_cloud") return row.specialization === "api_cloud";
      if (activeTab === "mobile") return row.specialization === "mobile";
      if (activeTab === "ai_crypto") return row.specialization === "ai_crypto";
      if (activeTab === "newcomers") return row.isNew || row.rankChange > 2;
      if (activeTab === "mentors") return row.badges.includes("Security Mentor") || row.badges.includes("Hall of Fame");

      // Time range adjustments (simulated filtering)
      if (timeRange === "rising") return row.rankChange > 1;

      return true;
    });
  }, [enrichedRows, search, activeTab, timeRange]);

  // Top spotlight researcher (default to #1 or user-selected)
  const spotlightResearcher = useMemo(() => {
    if (selectedResearcherId) {
      return enrichedRows.find((r) => r.researcherId === selectedResearcherId) || enrichedRows[0];
    }
    return enrichedRows[0] || null;
  }, [selectedResearcherId, enrichedRows]);

  function handleReset() {
    setSearch("");
    setActiveTab("overall");
    setTimeRange("all_time");
  }

  const hasActiveFilters = search.trim() !== "" || activeTab !== "overall" || timeRange !== "all_time";

  return (
    <div className="space-y-6">
      {/* 1. Header & Time Range Bar */}
      <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-xs font-semibold text-[#2563EB] border border-[#BFDBFE]">
                <Trophy className="size-3.5" />
                Researcher Leaderboard
              </span>
              <span className="text-xs text-[#667085]">Verified Outcomes · Append-Only Ledger</span>
            </div>
            <h2 className="mt-1.5 text-xl font-bold tracking-tight text-[#111827] sm:text-2xl">
              Platform Reputation & Impact Rankings
            </h2>
            <p className="mt-1 text-xs text-[#667085] max-w-2xl">
              Rankings reflect verified report quality, critical findings, organization trust scores, and confirmed resolutions—never volume alone.
            </p>
          </div>

          {/* Time Range Selector */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-[#F8FAFC] p-1 border border-[#E7EAF0]">
            {[
              { id: "all_time", label: "All Time" },
              { id: "this_quarter", label: "This Quarter" },
              { id: "this_month", label: "This Month" },
              { id: "this_week", label: "This Week" },
              { id: "rising", label: "Rising ⚡" },
            ].map((t) => {
              const isSelected = timeRange === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTimeRange(t.id as LeaderboardTimeRange)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    isSelected
                      ? "bg-[#FFFFFF] text-[#111827] shadow-sm font-bold"
                      : "text-[#667085] hover:text-[#111827]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & Methodology Explanation Strip */}
        <div className="mt-4 flex flex-col gap-3 pt-4 border-t border-[#F1F5F9] sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#667085]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search researcher by name, @username, skill, or country..."
              className="w-full rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] py-2 pl-9 pr-8 text-xs text-[#111827] placeholder:text-[#667085] focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#667085] hover:text-[#111827]"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#475467] bg-[#F8FAFC] px-3 py-1.5 rounded-xl border border-[#E7EAF0]">
            <Info className="size-3.5 text-[#2563EB] shrink-0" />
            <span>Rankings combine reputation points, severity weight, and researcher trust score.</span>
          </div>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards (4-6 Highlights) */}
      {summary && (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          {/* Card 1: Top Ranked */}
          <div
            onClick={() => handleOpenPreview(summary.top)}
            className="group cursor-pointer rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(16,24,40,0.06)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Top Overall</span>
              <span className="rounded-lg bg-[#FEF3C7] p-1 text-[#D97706]">
                <Trophy className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#111827] truncate">{summary.top.displayName}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black text-[#111827] tabular-nums">
                {summary.top.score.toLocaleString("en-US")}
              </span>
              <span className="text-[10px] text-[#667085]">pts</span>
            </div>
            <p className="mt-0.5 text-[10px] font-semibold text-[#059669]">Rank #1 Platform Leader</p>
          </div>

          {/* Card 2: Fastest Rising */}
          <div
            onClick={() => handleOpenPreview(summary.rising)}
            className="group cursor-pointer rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(16,24,40,0.06)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Fastest Rising</span>
              <span className="rounded-lg bg-[#ECFDF5] p-1 text-[#059669]">
                <TrendingUp className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#111827] truncate">{summary.rising.displayName}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black text-[#059669] tabular-nums">
                +{summary.rising.rankChange} Ranks
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-[#667085]">Climbed this season</p>
          </div>

          {/* Card 3: Critical Findings */}
          <div
            onClick={() => handleOpenPreview(summary.mostCritical)}
            className="group cursor-pointer rounded-2xl border border-[#FECACA] bg-[#FFF5F5] p-3.5 shadow-[0_1px_2px_rgba(220,38,38,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(220,38,38,0.08)] ring-1 ring-[#DC2626]/10"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#DC2626]">Critical Impact</span>
              <span className="rounded-lg bg-[#FEE2E2] p-1 text-[#DC2626]">
                <Flame className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#991B1B] truncate">{summary.mostCritical.displayName}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black text-[#DC2626] tabular-nums">
                {summary.mostCritical.criticalCount}
              </span>
              <span className="text-[10px] text-[#DC2626]">P1 Zero-Days</span>
            </div>
            <p className="mt-0.5 text-[10px] text-[#DC2626]">Highest severe findings</p>
          </div>

          {/* Card 4: Highest Trust Score */}
          <div
            onClick={() => handleOpenPreview(summary.highestTrust)}
            className="group cursor-pointer rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(16,24,40,0.06)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Highest Trust</span>
              <span className="rounded-lg bg-[#EFF6FF] p-1 text-[#2563EB]">
                <ShieldCheck className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#111827] truncate">{summary.highestTrust.displayName}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black text-[#2563EB] tabular-nums">
                {summary.highestTrust.trustScore}%
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-[#667085]">0% duplicate rate</p>
          </div>

          {/* Card 5: Longest Active Streak */}
          <div
            onClick={() => handleOpenPreview(summary.longestStreak)}
            className="group cursor-pointer rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(16,24,40,0.06)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Active Streak</span>
              <span className="rounded-lg bg-[#FEF3C7] p-1 text-[#D97706]">
                <Zap className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#111827] truncate">{summary.longestStreak.displayName}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black text-[#D97706] tabular-nums">
                {summary.longestStreak.streakDays}
              </span>
              <span className="text-[10px] text-[#667085]">consecutive days</span>
            </div>
            <p className="mt-0.5 text-[10px] text-[#667085]">Consistent contributor</p>
          </div>

          {/* Card 6: Hall of Fame */}
          <div
            onClick={() => handleOpenPreview(summary.hallOfFame)}
            className="group cursor-pointer rounded-2xl border border-[#E9D5FF] bg-[#FAF5FF] p-3.5 shadow-[0_1px_2px_rgba(124,58,237,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(124,58,237,0.08)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#7C3AED]">Hall of Fame</span>
              <span className="rounded-lg bg-[#F3E8FF] p-1 text-[#7C3AED]">
                <Award className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#581C87] truncate">{summary.hallOfFame.displayName}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-sm font-bold text-[#7C3AED]">
                {summary.hallOfFame.estimatedEarnings}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-[#7C3AED]">Lifetime verified bounties</p>
          </div>
        </div>
      )}

      {/* 3. Specialization Category Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E7EAF0] pb-2 text-xs">
        <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-[#667085]">Specialization:</span>
        {[
          { id: "overall", label: `Overall (${enrichedRows.length})` },
          { id: "api_cloud", label: "Cloud & APIs" },
          { id: "web", label: "Web Applications" },
          { id: "mobile", label: "Mobile & Client" },
          { id: "ai_crypto", label: "AI & Cryptography" },
          { id: "newcomers", label: "Rising Stars 🚀" },
          { id: "mentors", label: "Mentors & Hall of Fame" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as ResearcherSpecialization)}
              className={`rounded-full px-3.5 py-1.5 font-medium transition-all ${
                isActive
                  ? "bg-[#111827] text-[#FFFFFF] shadow-sm font-semibold"
                  : "bg-[#F1F5F9] text-[#475467] hover:bg-[#E2E8F0] hover:text-[#111827]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 4. Main Grid: Left = Leaderboard List & Featured Spotlight; Right = Insights Rail */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_390px]">
        {/* Left Main Column */}
        <div className="space-y-4 min-w-0">
          {/* Featured Spotlight Researcher Card */}
          {spotlightResearcher && (
            <div className="relative overflow-hidden rounded-2xl border border-[#E7EAF0] bg-gradient-to-br from-[#FFFFFF] to-[#F8FAFC] p-5 shadow-[0_2px_8px_rgba(16,24,40,0.06)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3.5">
                  {/* Avatar Identicon */}
                  <div className="relative size-14 shrink-0 rounded-2xl bg-[#111827] flex items-center justify-center text-lg font-black text-[#FFFFFF] shadow-md border-2 border-[#FFFFFF]">
                    {spotlightResearcher.displayName.slice(0, 2).toUpperCase()}
                    <span className="absolute -bottom-1 -right-1 size-4 rounded-full bg-[#10B981] border-2 border-[#FFFFFF]" title="Active recently" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 font-mono text-[11px] font-black text-[#D97706] border border-[#FDE68A]">
                        RANK #{spotlightResearcher.rank}
                      </span>
                      {spotlightResearcher.badges.map((b) => (
                        <span
                          key={b}
                          className="rounded-full bg-[#F3E8FF] px-2 py-0.5 text-[10px] font-bold text-[#7C3AED] border border-[#E9D5FF]"
                        >
                          {b}
                        </span>
                      ))}
                    </div>

                    <h3 className="mt-1 text-base font-bold text-[#111827] truncate">
                      {spotlightResearcher.displayName}
                    </h3>
                    <p className="font-mono text-xs text-[#667085]">
                      @{spotlightResearcher.username} · {spotlightResearcher.country.name}
                    </p>
                  </div>
                </div>

                {/* Score & Profile CTA */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 border-t border-[#F1F5F9] pt-3 sm:border-0 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Reputation</span>
                    <p className="font-mono text-2xl font-black text-[#111827] tabular-nums">
                      {spotlightResearcher.score.toLocaleString("en-US")}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(spotlightResearcher)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#E7EAF0] bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-semibold text-[#111827] hover:bg-[#F8FAFC] transition-colors shadow-sm"
                    >
                      <Eye className="size-3.5 text-[#2563EB]" />
                      <span>Preview Profile</span>
                    </button>

                    {spotlightResearcher.publicUsername && (
                      <Link
                        href={`/researchers/${spotlightResearcher.publicUsername}` as Route}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#2563EB] px-3.5 py-1.5 text-xs font-semibold text-[#FFFFFF] hover:bg-[#1D4ED8] transition-colors"
                      >
                        Full Profile
                        <ChevronRight className="size-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Bio & Key Metrics Strip */}
              <p className="mt-3 text-xs text-[#475467] leading-relaxed line-clamp-2">
                {spotlightResearcher.bioSnippet}
              </p>

              {/* Spotlight Badges & Metrics */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 border-t border-[#F1F5F9] pt-3 text-xs">
                <div className="rounded-xl bg-[#FFFFFF] border border-[#E7EAF0] p-2.5 text-center">
                  <span className="text-[10px] font-bold uppercase text-[#667085]">Trust Score</span>
                  <p className="font-mono text-sm font-black text-[#059669]">{spotlightResearcher.trustScore}%</p>
                </div>
                <div className="rounded-xl bg-[#FFFFFF] border border-[#E7EAF0] p-2.5 text-center">
                  <span className="text-[10px] font-bold uppercase text-[#667085]">Criticals</span>
                  <p className="font-mono text-sm font-black text-[#DC2626]">{spotlightResearcher.criticalCount} P1s</p>
                </div>
                <div className="rounded-xl bg-[#FFFFFF] border border-[#E7EAF0] p-2.5 text-center">
                  <span className="text-[10px] font-bold uppercase text-[#667085]">Acceptance</span>
                  <p className="font-mono text-sm font-black text-[#111827]">{spotlightResearcher.acceptanceRate}%</p>
                </div>
                <div className="rounded-xl bg-[#FFFFFF] border border-[#E7EAF0] p-2.5 text-center">
                  <span className="text-[10px] font-bold uppercase text-[#667085]">Streak</span>
                  <p className="font-mono text-sm font-black text-[#D97706]">🔥 {spotlightResearcher.streakDays}d</p>
                </div>
              </div>
            </div>
          )}

          {/* Leaderboard Table / Card Rows */}
          {visibleRows.length === 0 ? (
            <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-8 text-center">
              <p className="text-sm font-semibold text-[#111827]">No researchers found matching your criteria</p>
              <p className="mt-1 text-xs text-[#667085]">Try clearing your search keyword or switching category filters.</p>
              <button
                type="button"
                onClick={handleReset}
                className="mt-4 rounded-xl bg-[#111827] px-4 py-2 text-xs font-semibold text-[#FFFFFF] hover:bg-[#1F2937]"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleRows.map((row) => {
                const isMe = myResearcherId && row.researcherId === myResearcherId;
                const isSelected = spotlightResearcher?.researcherId === row.researcherId;

                return (
                  <div
                    key={row.researcherId ?? row.username}
                    onClick={() => handleOpenPreview(row)}
                    className={`group cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                      isSelected
                        ? "border-[#2563EB] bg-[#EFF6FF]/40 shadow-[0_4px_16px_rgba(37,99,235,0.08)] ring-1 ring-[#2563EB]"
                        : isMe
                          ? "border-[#3B82F6] bg-[#EFF6FF]/20"
                          : "border-[#E7EAF0] bg-[#FFFFFF] hover:border-[#CBD5E1] hover:bg-[#F8FAFC] shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      {/* Left: Rank, Movement, Avatar, Name & Badges */}
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Rank & Movement */}
                        <div className="flex w-12 shrink-0 flex-col items-center justify-center text-center">
                          {row.rank === 1 ? (
                            <span className="flex size-7 items-center justify-center rounded-full bg-[#FEF3C7] text-xs font-black text-[#D97706] border border-[#FDE68A]">
                              🥇
                            </span>
                          ) : row.rank === 2 ? (
                            <span className="flex size-7 items-center justify-center rounded-full bg-[#F1F5F9] text-xs font-black text-[#475467] border border-[#E2E8F0]">
                              🥈
                            </span>
                          ) : row.rank === 3 ? (
                            <span className="flex size-7 items-center justify-center rounded-full bg-[#FFFBEB] text-xs font-black text-[#B45309] border border-[#FDE68A]">
                              🥉
                            </span>
                          ) : (
                            <span className="font-mono text-sm font-black text-[#475467]">
                              #{row.rank}
                            </span>
                          )}

                          {/* Movement indicator */}
                          <div className="mt-0.5 flex items-center font-mono text-[10px] font-bold">
                            {row.rankChange > 0 ? (
                              <span className="flex items-center text-[#059669]">
                                <ArrowUp className="size-2.5" />
                                {row.rankChange}
                              </span>
                            ) : row.rankChange < 0 ? (
                              <span className="flex items-center text-[#DC2626]">
                                <ArrowDown className="size-2.5" />
                                {Math.abs(row.rankChange)}
                              </span>
                            ) : (
                              <span className="text-[#98A2B3]">
                                <Minus className="size-2.5" />
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Avatar */}
                        <div className="relative size-10 shrink-0 rounded-xl bg-[#1E293B] flex items-center justify-center text-xs font-bold text-[#FFFFFF]">
                          {row.displayName.slice(0, 2).toUpperCase()}
                          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-[#10B981] border border-[#FFFFFF]" />
                        </div>

                        {/* Name, Handle, Badges */}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-sm text-[#111827] group-hover:text-[#2563EB] transition-colors truncate">
                              {row.displayName}
                            </span>

                            {isMe && (
                              <span className="rounded-full bg-[#2563EB] px-2 py-0.2 text-[10px] font-bold text-[#FFFFFF]">
                                You
                              </span>
                            )}

                            {row.badges.includes("Hall of Fame") && (
                              <span className="rounded bg-[#FAF5FF] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#7C3AED] border border-[#E9D5FF]">
                                Hall of Fame
                              </span>
                            )}
                            {row.badges.includes("Top 1%") && (
                              <span className="rounded bg-[#EFF6FF] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#2563EB] border border-[#BFDBFE]">
                                Top 1%
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#667085]">
                            <span className="font-mono text-[11px]">@{row.username}</span>
                            <span>·</span>
                            <span>{row.country.name}</span>
                            <span>·</span>
                            <span className="flex items-center text-[#D97706] font-medium">
                              🔥 {row.streakDays}d streak
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Metrics & Preview Button */}
                      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 border-t border-[#F1F5F9] pt-2 sm:border-0 sm:pt-0">
                        {/* Quality & Trust Indicator */}
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase font-bold text-[#667085]">Trust Score</span>
                          <p className="font-mono text-xs font-bold text-[#059669]">
                            {row.trustScore}% <span className="text-[10px] text-[#667085]">({row.acceptanceRate}% accept)</span>
                          </p>
                        </div>

                        {/* Critical & High Findings */}
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase font-bold text-[#667085]">Findings</span>
                          <div className="flex items-center gap-1 font-mono text-xs font-bold">
                            <span className="text-[#DC2626]">{row.criticalCount} crit</span>
                            <span className="text-[#667085]">·</span>
                            <span className="text-[#111827]">{row.resolvedCount} res</span>
                          </div>
                        </div>

                        {/* Score */}
                        <div className="text-right min-w-[70px]">
                          <span className="text-[10px] uppercase font-bold text-[#667085]">Reputation</span>
                          <p className="font-mono text-base font-black text-[#111827] tabular-nums">
                            {row.score.toLocaleString("en-US")}
                          </p>
                        </div>

                        {/* Preview Profile Button */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPreview(row);
                            }}
                            className="flex items-center gap-1 rounded-lg border border-[#E7EAF0] bg-[#F8FAFC] px-2.5 py-1 text-xs font-semibold text-[#475467] hover:bg-[#EFF6FF] hover:text-[#2563EB] hover:border-[#BFDBFE] transition-colors"
                            title="Preview researcher stats"
                          >
                            <Eye className="size-3.5 text-[#2563EB]" />
                            <span className="hidden sm:inline">Preview</span>
                          </button>

                          {row.publicUsername && (
                            <Link
                              href={`/researchers/${row.publicUsername}` as Route}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded-lg p-1.5 text-[#667085] hover:bg-[#F1F5F9] hover:text-[#111827]"
                              title="View full researcher profile"
                            >
                              <ChevronRight className="size-4" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Skill Tags Strip */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#F1F5F9] pt-2 text-[11px] text-[#667085]">
                      <span className="text-[10px] font-semibold text-[#98A2B3]">Specialization:</span>
                      {row.tags.map((tag) => (
                        <span key={tag} className="rounded-md bg-[#F1F5F9] px-2 py-0.5 font-medium text-[#334155]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Insights & Governance Rail (Desktop) */}
        <div className="space-y-4">
          {/* Rail Card 1: How Reputation Scoring Works */}
          <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] space-y-3">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-[#EFF6FF] p-1.5 text-[#2563EB]">
                <ShieldCheck className="size-4" />
              </span>
              <h3 className="text-sm font-bold text-[#111827]">Reputation Scoring Rules</h3>
            </div>
            <p className="text-xs text-[#475467] leading-relaxed">
              Every score on Unpatched is computed directly from append-only organization ledger entries—never self-reported.
            </p>

            <div className="divide-y divide-[#F1F5F9] text-xs">
              <div className="flex items-center justify-between py-2">
                <span className="font-medium text-[#111827]">Verified Critical (P1)</span>
                <span className="font-mono font-bold text-[#059669]">+50 pts</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="font-medium text-[#111827]">Verified High (P2)</span>
                <span className="font-mono font-bold text-[#059669]">+35 pts</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="font-medium text-[#111827]">Verified Medium (P3)</span>
                <span className="font-mono font-bold text-[#059669]">+25 pts</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="font-medium text-[#111827]">Finalized Bounty</span>
                <span className="font-mono font-bold text-[#2563EB]">+10 pts</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="font-medium text-[#111827]">Rejected Report</span>
                <span className="font-mono font-bold text-[#DC2626]">-5 pts</span>
              </div>
              <div className="flex items-center justify-between py-2 text-[#667085]">
                <span>Duplicate / Informative</span>
                <span className="font-mono">0 pts (No penalty)</span>
              </div>
            </div>
          </div>

          {/* Rail Card 2: Hall of Fame Criteria */}
          <div className="rounded-2xl border border-[#E9D5FF] bg-gradient-to-br from-[#FAF5FF] to-[#FFFFFF] p-5 shadow-[0_1px_2px_rgba(124,58,237,0.04)] space-y-3">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-[#F3E8FF] p-1.5 text-[#7C3AED]">
                <Award className="size-4" />
              </span>
              <h3 className="text-sm font-bold text-[#581C87]">Hall of Fame Standards</h3>
            </div>
            <p className="text-xs text-[#6B21A8] leading-relaxed">
              Hall of Fame recognition is reserved for the top 1% of security researchers who establish proven reliability across multiple enterprise bug bounty engagements.
            </p>

            <ul className="space-y-1.5 text-xs text-[#581C87]">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-[#7C3AED] shrink-0" />
                <span>Minimum 10 verified Critical or High vulnerabilities</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-[#7C3AED] shrink-0" />
                <span>95%+ verified report acceptance rate</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-[#7C3AED] shrink-0" />
                <span>Zero safe-harbor policy infractions</span>
              </li>
            </ul>
          </div>

          {/* Rail Card 3: Trust Score Philosophy */}
          <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-[#ECFDF5] p-1.5 text-[#059669]">
                <Zap className="size-4" />
              </span>
              <h3 className="text-sm font-bold text-[#111827]">Quality Over Volume</h3>
            </div>
            <p className="text-xs text-[#475467] leading-relaxed">
              Automated mass scanning and non-impact submissions lower your Trust Score. High-impact findings with reproducible PoCs accelerate your rank and unlock private invite-only bug bounty programs.
            </p>
          </div>
        </div>
      </div>

      {/* 5. Interactive Researcher Profile Preview Slide-over Drawer */}
      <ResearcherPreviewDrawer
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        researcher={previewResearcher}
      />
    </div>
  );
}
