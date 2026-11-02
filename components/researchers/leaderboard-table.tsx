"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { PublicLeaderboardRow } from "../../types/reputation";
import {
  enrichLeaderboardRow,
  calculateLeaderboardSummary,
  type EnrichedLeaderboardRow,
  type LeaderboardSort,
} from "../../lib/researcher-leaderboard-intelligence";
import { ResearcherPreviewDrawer } from "./researcher-preview-drawer";
import {
  Search,
  Trophy,
  ShieldCheck,
  Award,
  Zap,
  ChevronRight,
  CheckCircle2,
  X,
  Sparkles,
  Info,
  Medal,
  Eye,
} from "lucide-react";

export function LeaderboardTable({
  rows,
  myResearcherId,
}: {
  rows: PublicLeaderboardRow[];
  myResearcherId?: string;
}) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<LeaderboardSort>("score");
  const [selectedResearcherId] = useState<string | null>(null);

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

  // 3. Search by name or @username, then order by the chosen public measure.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q ? enrichedRows.filter((row) => `${row.displayName} @${row.username}`.toLowerCase().includes(q)) : enrichedRows;
    if (activeTab === "resolved") return [...matched].sort((a, b) => b.resolvedCount - a.resolvedCount);
    if (activeTab === "bounties") return [...matched].sort((a, b) => b.bountyFinalizedCount - a.bountyFinalizedCount);
    return matched;
  }, [enrichedRows, search, activeTab]);

  // Top spotlight researcher (default to #1 or user-selected)
  const spotlightResearcher = useMemo(() => {
    if (selectedResearcherId) {
      return enrichedRows.find((r) => r.researcherId === selectedResearcherId) || enrichedRows[0];
    }
    return enrichedRows[0] || null;
  }, [selectedResearcherId, enrichedRows]);

  function handleReset() {
    setSearch("");
    setActiveTab("score");
  }


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
              Rankings come from organization-confirmed resolutions and finalized bounties, never self-reported.
            </p>
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
              placeholder="Search researcher by name or @username..."
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
            <span>Score comes from the append-only reputation ledger: resolutions and finalized bounties.</span>
          </div>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards (4-6 Highlights) */}
      {summary && (
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <div
            onClick={() => handleOpenPreview(summary.top)}
            className="group cursor-pointer rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(16,24,40,0.06)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Top Overall</span>
              <span className="rounded-lg bg-[#FEF3C7] text-[#D97706] p-1">
                <Trophy className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#111827] truncate">{summary.top.displayName}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black text-[#111827] tabular-nums">{summary.top.score.toLocaleString("en-US")}</span>
              <span className="text-[10px] text-[#667085]">pts</span>
            </div>
          </div>
          <div
            onClick={() => handleOpenPreview(summary.mostResolved)}
            className="group cursor-pointer rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(16,24,40,0.06)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Most Resolved</span>
              <span className="rounded-lg bg-[#ECFDF3] text-[#059669] p-1">
                <Medal className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#111827] truncate">{summary.mostResolved.displayName}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black text-[#111827] tabular-nums">{summary.mostResolved.resolvedCount.toLocaleString("en-US")}</span>
              <span className="text-[10px] text-[#667085]">resolved</span>
            </div>
          </div>
          <div
            onClick={() => handleOpenPreview(summary.mostBounties)}
            className="group cursor-pointer rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(16,24,40,0.06)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Most Bounties</span>
              <span className="rounded-lg bg-[#EFF6FF] text-[#2563EB] p-1">
                <Sparkles className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#111827] truncate">{summary.mostBounties.displayName}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black text-[#111827] tabular-nums">{summary.mostBounties.bountyFinalizedCount.toLocaleString("en-US")}</span>
              <span className="text-[10px] text-[#667085]">finalized</span>
            </div>
          </div>
          <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Researchers Ranked</span>
            <p className="mt-2 font-mono text-lg font-black text-[#111827] tabular-nums">{summary.ranked.toLocaleString("en-US")}</p>
            <p className="mt-0.5 text-[10px] text-[#667085]">With at least one verified outcome</p>
          </div>
        </div>
      )}

      {/* 3. Specialization Category Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E7EAF0] pb-2 text-xs">
        <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-[#667085]">Rank by:</span>
        {[
          { id: "score", label: `Score (${enrichedRows.length})` },
          { id: "resolved", label: "Resolved reports" },
          { id: "bounties", label: "Finalized bounties" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as LeaderboardSort)}
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
                    </div>

                    <h3 className="mt-1 text-base font-bold text-[#111827] truncate">
                      {spotlightResearcher.displayName}
                    </h3>
                    <p className="font-mono text-xs text-[#667085]">
                      {spotlightResearcher.username ? `@${spotlightResearcher.username}` : "Private profile"}
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

              {/* Spotlight Metrics */}
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#F1F5F9] pt-3 text-xs">
                <div className="rounded-xl bg-[#FFFFFF] border border-[#E7EAF0] p-2.5 text-center">
                  <span className="text-[10px] font-bold uppercase text-[#667085]">Rank</span>
                  <p className="font-mono text-sm font-black text-[#111827]">#{spotlightResearcher.rank}</p>
                </div>
                <div className="rounded-xl bg-[#FFFFFF] border border-[#E7EAF0] p-2.5 text-center">
                  <span className="text-[10px] font-bold uppercase text-[#667085]">Resolved</span>
                  <p className="font-mono text-sm font-black text-[#059669]">{spotlightResearcher.resolvedCount}</p>
                </div>
                <div className="rounded-xl bg-[#FFFFFF] border border-[#E7EAF0] p-2.5 text-center">
                  <span className="text-[10px] font-bold uppercase text-[#667085]">Bounties</span>
                  <p className="font-mono text-sm font-black text-[#2563EB]">{spotlightResearcher.bountyFinalizedCount}</p>
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
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#667085]">
                            {row.username ? <span className="font-mono text-[11px]">@{row.username}</span> : <span>Private profile</span>}
                          </div>
                        </div>
                      </div>

                      {/* Right: Metrics & Preview Button */}
                      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 border-t border-[#F1F5F9] pt-2 sm:border-0 sm:pt-0">
                        {/* Public outcomes */}
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase font-bold text-[#667085]">Outcomes</span>
                          <div className="flex items-center gap-1 font-mono text-xs font-bold">
                            <span className="text-[#059669]">{row.resolvedCount} res</span>
                            <span className="text-[#667085]">·</span>
                            <span className="text-[#2563EB]">{row.bountyFinalizedCount} paid</span>
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
              An organization can add a researcher to its Hall of Fame after a report it received is resolved. It shows publicly only once the researcher agrees.
            </p>

            <ul className="space-y-1.5 text-xs text-[#581C87]">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-[#7C3AED] shrink-0" />
                <span>Proposed by the organization, for a resolved report</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-[#7C3AED] shrink-0" />
                <span>Accepted by the researcher before it is published</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-[#7C3AED] shrink-0" />
                <span>Lists name, program and date only</span>
              </li>
            </ul>
          </div>

          {/* Rail Card 3: Quality over volume */}
          <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-[#ECFDF5] p-1.5 text-[#059669]">
                <Zap className="size-4" />
              </span>
              <h3 className="text-sm font-bold text-[#111827]">Quality Over Volume</h3>
            </div>
            <p className="text-xs text-[#475467] leading-relaxed">
              Only organization-confirmed outcomes count. A rejected report costs 5 points; duplicates and informative reports cost nothing; higher-severity resolutions earn more.
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
