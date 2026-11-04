import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CheckCircle2, Gem, ShieldCheck, Sparkles, Users } from "lucide-react";
import { OrgLogo } from "../ui/org-logo";
import { assetTypeLabel } from "../../lib/scope-labels";
import { focusAreaLabel } from "../../lib/researcher-identity-labels";
import { formatBountyRange } from "../../lib/money";
import type { PublicProgramSummary } from "../../types/program";

// Program cards for discovery. Every value is a real field on PublicProgramSummary; badges are
// facts (top reward list, a literal focus-area match, KYC), never a score or a review count.

export type DiscoveryHints = { recommendedIds?: string[]; topRewardIds?: string[]; joinedIds?: string[] };

// A stable accent per organization, so its programs are recognisable at a glance.
const ACCENTS = [
  "from-[#111827] via-[#1F2937] to-[#374151]",
  "from-[#C2410C] via-[#EA580C] to-[#FB923C]",
  "from-[#1D4ED8] via-[#2563EB] to-[#60A5FA]",
  "from-[#4C1D95] via-[#6D28D9] to-[#A78BFA]",
  "from-[#065F46] via-[#047857] to-[#34D399]",
  "from-[#9F1239] via-[#E11D48] to-[#FB7185]",
];
function accentFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function Badge({ tone, icon: Icon, children }: { tone: "green" | "blue" | "violet" | "amber"; icon: typeof CheckCircle2; children: React.ReactNode }) {
  const cls = { green: "bg-[#ECFDF3] text-[#027A48]", blue: "bg-[#EFF6FF] text-[#1D4ED8]", violet: "bg-[#F5F3FF] text-[#6D28D9]", amber: "bg-[#FFFAEB] text-[#B54708]" }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}><Icon aria-hidden className="size-3" />{children}</span>;
}

export function ProgramDiscoveryGrid({ programs, hints = {} }: { programs: PublicProgramSummary[]; hints?: DiscoveryHints }) {
  return (
    <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {programs.map((program) => {
        // What can be tested first (two asset types), then one focus area; the rest is counted.
        const assets = program.assetTypes.map(assetTypeLabel);
        const focus = program.focusAreas.map(focusAreaLabel);
        const shown = [...assets.slice(0, 2), ...focus.slice(0, 1)];
        const tags = [...assets, ...focus];
        const href = `/organizations/${program.organizationId}/programs/${program.id}` as Route;
        const joined = hints.joinedIds?.includes(program.id);
        const reward =
          program.bountyMinMinorUnits !== null && program.bountyMaxMinorUnits !== null && program.bountyCurrency
            ? formatBountyRange(program.bountyMinMinorUnits, program.bountyMaxMinorUnits, program.bountyCurrency)
            : program.programType === "vdp" ? "Disclosure only" : "No bounty set yet";
        return (
          <li key={program.id} className="flex min-w-0">
            <article className="group flex w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
              <div aria-hidden className={`w-2.5 shrink-0 bg-gradient-to-b sm:w-3.5 ${accentFor(program.organizationId)}`} />
              <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
                <div className="flex flex-wrap gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${program.status === "active" ? "bg-[#ECFDF3] text-[#027A48]" : "bg-[#FFFAEB] text-[#B54708]"}`}>
                    <span aria-hidden className={`size-1.5 rounded-full ${program.status === "active" ? "bg-[#12B76A]" : "bg-[#F79009]"}`} />{program.status === "active" ? "Active" : "Paused"}
                  </span>
                  {program.programType === "bounty" ? <Badge tone="green" icon={CheckCircle2}>Bug bounty</Badge> : <Badge tone="blue" icon={ShieldCheck}>Vulnerability disclosure</Badge>}
                  {hints.topRewardIds?.includes(program.id) && <Badge tone="violet" icon={Gem}>Top reward</Badge>}
                  {hints.recommendedIds?.includes(program.id) && <Badge tone="blue" icon={Sparkles}>Matches your interests</Badge>}
                  {program.requiresKyc && <Badge tone="amber" icon={ShieldCheck}>Identity check</Badge>}
                </div>
                <div className="mt-3 flex items-start gap-3">
                  <OrgLogo organizationId={program.organizationId} name={program.organizationName} version={program.logoVersion} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[16px] font-semibold leading-snug text-ink"><Link prefetch={false} href={href} className="hover:underline">{program.name}</Link></h3>
                    <p className="truncate text-[12px] text-ink-muted">{program.organizationName}</p>
                  </div>
                </div>
                {program.description && <p className="mt-2 line-clamp-2 text-[13px] text-ink-muted">{program.description}</p>}
                {shown.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Focus and assets">
                    {shown.map((t) => <li key={t} className="rounded-md border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink">{t}</li>)}
                    {tags.length > shown.length && <li className="rounded-md border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-muted">+{tags.length - shown.length}</li>}
                  </ul>
                )}
                <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4 [margin-top:max(1rem,auto)]">
                  <div className="min-w-0">
                    <p className="text-[19px] font-bold leading-tight tracking-tight text-ink">{reward}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-ink-muted">
                      <span className="inline-flex items-center gap-1"><Users aria-hidden className="size-3.5" />{program.activeResearcherCount} {program.activeResearcherCount === 1 ? "researcher" : "researchers"}</span>
                      <span className="inline-flex items-center gap-1"><CheckCircle2 aria-hidden className="size-3.5" />{program.resolvedReportCount} resolved</span>
                    </p>
                  </div>
                  <Link prefetch={false} href={href} className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-[#111827] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-black">
                    {joined ? "Open program" : "View program"}<ArrowRight aria-hidden className="size-4" />
                  </Link>
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
