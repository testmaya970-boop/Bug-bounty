"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { EnrichedLeaderboardRow } from "../../lib/researcher-leaderboard-intelligence";
import {
  X,
  Trophy,
  ShieldCheck,
  Flame,
  Award,
  Zap,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Globe,
  Star,
  Activity,
  Layers,
  Sparkles,
  Medal,
} from "lucide-react";

export function ResearcherPreviewDrawer({
  isOpen,
  onClose,
  researcher,
}: {
  isOpen: boolean;
  onClose: () => void;
  researcher: EnrichedLeaderboardRow | null;
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !researcher) return null;

  const publicPath = researcher.publicUsername
    ? `/researchers/${researcher.publicUsername}`
    : null;

  function handleCopy() {
    if (publicPath) {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      navigator.clipboard.writeText(`${origin}${publicPath}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity duration-200">
      {/* Click outside to close */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Slide-over Drawer */}
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col bg-[#FFFFFF] shadow-2xl overflow-y-auto border-l border-[#E7EAF0] animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#E7EAF0] bg-[#FFFFFF]/90 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-xs font-semibold text-[#2563EB] border border-[#BFDBFE]">
              <ShieldCheck className="size-3.5" />
              Verified Researcher Profile
            </span>
          </div>

          <div className="flex items-center gap-2">
            {publicPath && (
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-lg border border-[#E7EAF0] bg-[#F8FAFC] px-2.5 py-1 text-xs font-semibold text-[#475467] hover:bg-[#F1F5F9] hover:text-[#111827] transition-colors"
                title="Copy profile link"
              >
                {copied ? <Check className="size-3.5 text-[#059669]" /> : <Copy className="size-3.5" />}
                <span>{copied ? "Copied" : "Share"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#667085] hover:bg-[#F1F5F9] hover:text-[#111827] transition-colors"
              aria-label="Close drawer"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="p-6 space-y-6">
          {/* Hero Profile Banner */}
          <div className="relative overflow-hidden rounded-2xl border border-[#E7EAF0] bg-gradient-to-br from-[#1E293B] to-[#0F172A] p-6 text-[#FFFFFF] shadow-md">
            <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[#2563EB]/25 blur-2xl" />

            <div className="relative z-10 flex items-start gap-4">
              {/* Avatar Identicon */}
              <div className="relative flex size-16 shrink-0 items-center justify-center rounded-2xl bg-[#0F172A] border-2 border-[#FFFFFF]/20 text-xl font-black text-[#FFFFFF] shadow-lg">
                {researcher.displayName.slice(0, 2).toUpperCase()}
                <span className="absolute -bottom-1 -right-1 size-4 rounded-full bg-[#10B981] border-2 border-[#0F172A]" title="Active recently" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 font-mono text-[11px] font-black text-[#D97706] border border-[#FDE68A]">
                    RANK #{researcher.rank}
                  </span>
                  {researcher.badges.map((b) => (
                    <span
                      key={b}
                      className="rounded-full bg-[#FFFFFF]/10 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-[#E2E8F0] border border-[#FFFFFF]/15"
                    >
                      {b}
                    </span>
                  ))}
                </div>

                <h2 className="mt-2 text-xl font-bold tracking-tight text-[#FFFFFF] truncate">
                  {researcher.displayName}
                </h2>
                <div className="flex items-center gap-2 text-xs text-[#94A3B8] font-mono">
                  <span>@{researcher.username}</span>
                  <span>·</span>
                  <span>{researcher.country.name}</span>
                  <span>·</span>
                  <span className="text-[#38BDF8]">Active {researcher.lastActive}</span>
                </div>
              </div>
            </div>

            {/* Streak & Status Strip */}
            <div className="relative z-10 mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#FFFFFF]/10 pt-4 text-xs text-[#CBD5E1]">
              <span className="flex items-center gap-1.5 font-semibold text-[#FBBF24]">
                <Flame className="size-4" />
                <span>{researcher.streakDays}-Day Active Streak</span>
              </span>
              <span className="rounded-full bg-[#10B981]/20 px-2.5 py-0.5 text-[11px] font-bold text-[#34D399] border border-[#10B981]/30">
                Safe Harbor Authorized
              </span>
            </div>
          </div>

          {/* Key Metric Grid (4-box) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-3.5 shadow-sm text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Reputation</span>
              <p className="mt-1 font-mono text-xl font-black text-[#111827] tabular-nums">
                {researcher.score.toLocaleString("en-US")}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-[#2563EB]">Platform Score</p>
            </div>

            <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-3.5 shadow-sm text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Trust Score</span>
              <p className="mt-1 font-mono text-xl font-black text-[#059669] tabular-nums">
                {researcher.trustScore}%
              </p>
              <p className="mt-0.5 text-[10px] text-[#667085]">Signal Quality</p>
            </div>

            <div className="rounded-2xl border border-[#FECACA] bg-[#FFF5F5] p-3.5 shadow-sm text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#DC2626]">Critical P1s</span>
              <p className="mt-1 font-mono text-xl font-black text-[#DC2626] tabular-nums">
                {researcher.criticalCount}
              </p>
              <p className="mt-0.5 text-[10px] text-[#DC2626]">Zero-Day Impact</p>
            </div>

            <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-3.5 shadow-sm text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Acceptance</span>
              <p className="mt-1 font-mono text-xl font-black text-[#111827] tabular-nums">
                {researcher.acceptanceRate}%
              </p>
              <p className="mt-0.5 text-[10px] text-[#667085]">Verified Ratio</p>
            </div>
          </div>

          {/* Biography & Research Philosophy */}
          <div className="rounded-2xl border border-[#E7EAF0] bg-[#F8FAFC] p-4 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
              About the Researcher
            </span>
            <p className="text-xs text-[#334155] leading-relaxed">
              {researcher.bioSnippet}
            </p>
          </div>

          {/* Specialization & Focus Areas */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
              Technical Focus Areas
            </span>
            <div className="flex flex-wrap gap-2">
              {researcher.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-xl border border-[#E7EAF0] bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#111827] shadow-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Verified Achievements & Badges Showcase */}
          <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                Verified Achievements
              </span>
              <span className="text-[11px] font-semibold text-[#2563EB]">Ledger Confirmed</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="flex items-start gap-2.5 rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] p-3">
                <Medal className="size-5 text-[#EAB308] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[#111827]">Resolver <span className="text-[#059669]">Gold</span></p>
                  <p className="text-[11px] text-[#667085]">{researcher.resolvedCount} confirmed resolutions</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] p-3">
                <Flame className="size-5 text-[#DC2626] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[#111827]">Critical Finder <span className="text-[#DC2626]">Elite</span></p>
                  <p className="text-[11px] text-[#667085]">{researcher.criticalCount} verified P1 zero-days</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] p-3">
                <Trophy className="size-5 text-[#7C3AED] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[#111827]">Bounty Earner <span className="text-[#7C3AED]">Silver</span></p>
                  <p className="text-[11px] text-[#667085]">{researcher.estimatedEarnings} in awards</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] p-3">
                <ShieldCheck className="size-5 text-[#2563EB] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[#111827]">High Signal <span className="text-[#2563EB]">Top 1%</span></p>
                  <p className="text-[11px] text-[#667085]">{researcher.trustScore}% quality trust score</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="border-t border-[#E7EAF0] pt-4 flex flex-col sm:flex-row items-center gap-3">
            {researcher.publicUsername && (
              <Link
                href={`/researchers/${researcher.publicUsername}` as Route}
                className="flex w-full sm:flex-1 items-center justify-center gap-2 rounded-xl bg-[#111827] px-4 py-3 text-xs font-semibold text-[#FFFFFF] hover:bg-[#1F2937] transition-colors shadow-sm"
              >
                <span>View Full Public Profile</span>
                <ExternalLink className="size-3.5" />
              </Link>
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex w-full sm:w-auto items-center justify-center rounded-xl border border-[#E7EAF0] bg-[#FFFFFF] px-5 py-3 text-xs font-semibold text-[#475467] hover:bg-[#F8FAFC] hover:text-[#111827] transition-colors"
            >
              Close Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
