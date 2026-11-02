import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Route } from "next";
import { BadgeGrid } from "../../../components/researchers/badge-grid";
import { getPublicResearcherProfile, getResearcherBadges } from "../../../services/reputation";
import { getResearcherCtfBadges } from "../../../services/ctf";
import { focusAreaLabel, securityFocusLabel } from "../../../lib/researcher-identity-labels";
import { getPublicResearcherLinks } from "../../../services/researcher-profiles";
import { ExternalProfileLinks } from "../../../components/researchers/external-profile-links";
import {
  ShieldCheck,
  Trophy,
  Flame,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

/**
 * Public Verified Researcher Profile
 * Clean, enterprise-grade public portfolio of verified security outcomes, reputation,
 * achievement badges, and technical focus areas.
 */
export default async function PublicResearcherProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getPublicResearcherProfile(username);
  if (!profile) notFound();

  const [badges, ctfBadges, links] = await Promise.all([
    getResearcherBadges(profile.researcherId),
    getResearcherCtfBadges(profile.researcherId),
    getPublicResearcherLinks(profile.publicUsername),
  ]);


  return (
    <div className="min-h-dvh bg-[#F6F8FB] text-[#111827]">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-[#E7EAF0] bg-[#FFFFFF]/90 px-4 py-3.5 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              prefetch={false}
              href="/researchers"
              className="flex items-center gap-1.5 rounded-lg border border-[#E7EAF0] bg-[#F8FAFC] px-2.5 py-1 text-xs font-semibold text-[#475467] hover:bg-[#F1F5F9] hover:text-[#111827] transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              <span>Leaderboard</span>
            </Link>
            <span className="text-xs text-[#667085]">/</span>
            <span className="text-xs font-semibold text-[#111827]">Researcher Profile</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              prefetch={false}
              href="/sign-in"
              className="text-xs font-semibold text-[#475467] hover:text-[#111827]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
        {/* Flagship Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-[#E7EAF0] bg-gradient-to-br from-[#1E293B] to-[#0F172A] p-6 text-[#FFFFFF] shadow-md sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-[#2563EB]/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 -bottom-24 size-64 rounded-full bg-[#10B981]/15 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              {/* Avatar Identicon */}
              <div className="relative flex size-20 shrink-0 items-center justify-center rounded-2xl bg-[#0F172A] border-2 border-[#FFFFFF]/25 text-2xl font-black text-[#FFFFFF] shadow-xl">
                {profile.displayName.slice(0, 2).toUpperCase()}
                <span className="absolute -bottom-1 -right-1 size-4 rounded-full bg-[#10B981] border-2 border-[#0F172A]" title="Active recently" />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/20 px-2.5 py-0.5 text-[11px] font-bold text-[#34D399] border border-[#10B981]/30">
                    <ShieldCheck className="size-3" />
                    Verified Security Researcher
                  </span>
                  <span className="rounded-full bg-[#FFFFFF]/10 backdrop-blur-sm px-2.5 py-0.5 text-[11px] font-bold text-[#E2E8F0] border border-[#FFFFFF]/15">
                    Safe Harbor Authorized
                  </span>
                </div>

                <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#FFFFFF] sm:text-3xl">
                  {profile.displayName}
                </h1>
                <p className="font-mono text-sm text-[#94A3B8]">
                  @{profile.publicUsername}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 4-Box Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#667085]">Reputation</span>
              <span className="rounded-lg bg-[#EFF6FF] p-1.5 text-[#2563EB]">
                <Trophy className="size-4" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-black text-[#111827] tabular-nums">
              {profile.score.toLocaleString("en-US")}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-[#2563EB]">Verified Score</p>
          </div>

          <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#667085]">Bounties</span>
              <span className="rounded-lg bg-[#ECFDF5] p-1.5 text-[#059669]">
                <ShieldCheck className="size-4" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-black text-[#059669] tabular-nums">
              {profile.bountyFinalizedCount.toLocaleString("en-US")}
            </p>
            <p className="mt-0.5 text-xs text-[#667085]">Finalized awards</p>
          </div>

          <div className="rounded-2xl border border-[#FECACA] bg-[#FFF5F5] p-4 shadow-[0_1px_2px_rgba(220,38,38,0.04)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#DC2626]">Badges</span>
              <span className="rounded-lg bg-[#FEE2E2] p-1.5 text-[#DC2626]">
                <Flame className="size-4" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-black text-[#DC2626] tabular-nums">
              {badges.length + ctfBadges.length}
            </p>
            <p className="mt-0.5 text-xs text-[#DC2626]">Earned on Unpatched</p>
          </div>

          <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#667085]">Resolved</span>
              <span className="rounded-lg bg-[#F8FAFC] p-1.5 text-[#475467]">
                <CheckCircle2 className="size-4" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-black text-[#111827] tabular-nums">
              {profile.resolvedCount.toLocaleString("en-US")}
            </p>
            <p className="mt-0.5 text-xs text-[#667085]">Confirmed by organizations</p>
          </div>
        </div>

        {/* Biography */}
        {profile.biography && (
          <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#667085]">About</h3>
            <p className="whitespace-pre-wrap text-sm text-[#475467] leading-relaxed">
              {profile.biography}
            </p>
          </div>
        )}

        {/* Achievement Badges */}
        <BadgeGrid badges={badges} ctfBadges={ctfBadges} />

        {/* Focus Areas */}
        {(profile.hackingInterests.length > 0 || profile.securityFocus.length > 0) && (
          <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#667085]">
              Technical Focus Areas & Specializations
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.hackingInterests.map((area) => (
                <span
                  key={area}
                  className="rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#111827]"
                >
                  {focusAreaLabel(area)}
                </span>
              ))}
              {profile.securityFocus.map((focus) => (
                <span
                  key={focus}
                  className="rounded-xl border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#111827]"
                >
                  {securityFocusLabel(focus)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* External Links */}
        {links && Object.values(links).some(Boolean) && (
          <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#667085]">
              Verified External Profiles
            </h3>
            <ExternalProfileLinks handles={links} />
          </div>
        )}

        {/* Footer Disclaimer */}
        <div className="border-t border-[#E7EAF0] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#667085]">
          <p>
            Computed from organization-confirmed report resolutions and finalized bounties on an append-only ledger.
          </p>
          <Link
            prefetch={false}
            href={"/researchers" as Route}
            className="font-semibold text-[#2563EB] hover:underline"
          >
            ← Back to Leaderboard
          </Link>
        </div>
      </main>
    </div>
  );
}
