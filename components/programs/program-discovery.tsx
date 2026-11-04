import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, BookOpen, Cloud, Code2, FileText, Gem, Globe, LayoutGrid, Medal, Network, Search, ShieldCheck, Smartphone, Sparkles, Star, Trophy, UserCheck } from "lucide-react";
import { OrgLogo } from "../ui/org-logo";
import { FOCUS_AREA_ORDER, focusAreaLabel } from "../../lib/researcher-identity-labels";
import { PROGRAM_ASSET_TYPES } from "../../lib/program-filters";
import { assetTypeLabel } from "../../lib/scope-labels";
import { formatBountyRange, formatMoney } from "../../lib/money";
import type { PublicProgramFilters } from "../../lib/program-filters";
import type { PublicProgramSummary } from "../../types/program";
import type { RecommendedProgram } from "../../types/researcher-identity";

type Params = Record<string, string | undefined>;

/** The registry URL with some filters changed; empty values drop the key. */
function withParams(current: Params, next: Params): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...next, tab: "all" })) if (v) p.set(k, v);
  return `/programs?${p.toString()}`;
}

export function filtersToParams(f: PublicProgramFilters): Params {
  return {
    q: f.search,
    status: f.status,
    focusArea: f.focusArea,
    assetType: f.assetType,
    programType: f.programType,
    minBounty: f.minBountyMinorUnits ? String(f.minBountyMinorUnits / 100) : undefined,
    kyc: f.requiresKyc === undefined ? undefined : f.requiresKyc ? "required" : "none",
    sort: f.sort,
  };
}

const select = "h-11 min-w-0 rounded-[10px] border-0 bg-transparent px-2 text-[14px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function ProgramsHero({ filters, liveCount, liveIsLowerBound }: { filters: PublicProgramFilters; liveCount: number; liveIsLowerBound: boolean }) {
  return (
    <section aria-labelledby="discover-heading" className="relative overflow-hidden rounded-2xl border border-border bg-surface">
      {/* The dark field on the right: a dotted sphere drawn in CSS, no image. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[55%] md:block" style={{ background: "radial-gradient(circle at 78% 42%, #1E293B 0%, #0B1220 46%, rgba(11,18,32,0.6) 66%, transparent 84%)" }} />
      <div aria-hidden className="pointer-events-none absolute right-[-6%] top-[-18%] hidden aspect-square w-[46%] rounded-full opacity-60 md:block" style={{ background: "radial-gradient(circle, rgba(148,163,184,0.55) 1px, transparent 1.4px) 0 0 / 14px 14px", maskImage: "radial-gradient(circle at 50% 50%, black 45%, transparent 70%)", WebkitMaskImage: "radial-gradient(circle at 50% 50%, black 45%, transparent 70%)" }} />
      <div className="relative grid gap-6 p-5 sm:p-8 md:grid-cols-[minmax(0,1fr)_14rem] md:items-end">
        <div className="min-w-0">
          <h2 id="discover-heading" className="max-w-xl text-[34px] font-extrabold leading-[1.05] tracking-tight text-ink sm:text-[46px]">Find Your Next Security Target</h2>
          <p className="mt-3 max-w-xl text-[15px] text-ink-muted">Explore bug bounty and disclosure programs from organizations on Unpatched.</p>
          <form action="/programs" method="get" role="search" aria-label="Search programs" className="mt-6 max-w-2xl rounded-2xl border border-border bg-surface p-1.5 shadow-lg">
            <input type="hidden" name="tab" value="all" />
            {filters.assetType && <input type="hidden" name="assetType" value={filters.assetType} />}
            {filters.sort && <input type="hidden" name="sort" value={filters.sort} />}
            {filters.requiresKyc !== undefined && <input type="hidden" name="kyc" value={filters.requiresKyc ? "required" : "none"} />}
            {filters.minBountyMinorUnits && <input type="hidden" name="minBounty" value={String(filters.minBountyMinorUnits / 100)} />}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
              <label className="flex min-w-0 flex-1 items-center gap-2 px-3">
                <Search aria-hidden className="size-5 shrink-0 text-ink-muted" />
                <span className="sr-only">Search programs</span>
                <input type="search" name="q" defaultValue={filters.search ?? ""} maxLength={100} placeholder="Search programs" className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-muted" />
              </label>
              <div className="flex min-w-0 items-center gap-1 border-border sm:border-l sm:pl-2">
                <label className="sr-only" htmlFor="discover-type">Program type</label>
                <select id="discover-type" name="programType" defaultValue={filters.programType ?? ""} className={select}>
                  <option value="">All Types</option>
                  <option value="bounty">Bug bounty</option>
                  <option value="vdp">Disclosure</option>
                </select>
                <label className="sr-only" htmlFor="discover-focus">Focus area</label>
                <select id="discover-focus" name="focusArea" defaultValue={filters.focusArea ?? ""} className={select}>
                  <option value="">All Focus Areas</option>
                  {FOCUS_AREA_ORDER.map((f) => <option key={f} value={f}>{focusAreaLabel(f)}</option>)}
                </select>
              </div>
              <button type="submit" className="h-11 shrink-0 rounded-xl bg-[#111827] px-6 text-[14px] font-semibold text-white hover:bg-black">Search</button>
            </div>
          </form>
        </div>
        <div className="rounded-2xl border border-white/15 bg-[#0B1220]/85 p-4 text-white shadow-xl backdrop-blur md:mb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[12px] font-semibold"><span className="size-2 rounded-full bg-[#12B76A]" />Live</span>
          <p className="mt-2 text-[34px] font-bold leading-none">{liveCount}{liveIsLowerBound ? "+" : ""}</p>
          <p className="mt-1 text-[13px] text-white/75">{liveCount === 1 && !liveIsLowerBound ? "public program" : "public programs"}{filters.search || filters.focusArea || filters.programType ? " match" : " open now"}</p>
        </div>
      </div>
    </section>
  );
}

const CHIPS: { label: string; icon: typeof Globe; params: Params }[] = [
  { label: "All", icon: LayoutGrid, params: {} },
  { label: "Web", icon: Globe, params: { focusArea: "web_applications" } },
  { label: "API", icon: Code2, params: { focusArea: "apis" } },
  { label: "Cloud", icon: Cloud, params: { focusArea: "cloud_infrastructure" } },
  { label: "Mobile", icon: Smartphone, params: { focusArea: "mobile_applications" } },
  { label: "Network", icon: Network, params: { focusArea: "networks" } },
  { label: "Bug bounty", icon: Gem, params: { programType: "bounty" } },
  { label: "Disclosure", icon: ShieldCheck, params: { programType: "vdp" } },
  { label: "Highest reward", icon: Star, params: { sort: "bounty" } },
  { label: "No identity check", icon: UserCheck, params: { kyc: "none" } },
];

/** Quick filters: each chip is one real list_public_programs filter, kept in the URL. */
export function ProgramFilterChips({ filters }: { filters: PublicProgramFilters }) {
  const current = filtersToParams(filters);
  const anyChipFilter = Boolean(current.focusArea || current.programType || current.sort || current.kyc);
  return (
    <nav aria-label="Quick filters" className="flex flex-wrap gap-2">
      {CHIPS.map((chip) => {
        const keys = Object.keys(chip.params);
        const active = keys.length === 0 ? !anyChipFilter : keys.every((k) => current[k] === chip.params[k]);
        const clear = Object.fromEntries(keys.map((k) => [k, undefined]));
        const href = keys.length === 0 ? withParams({ q: current.q }, {}) : withParams(current, active ? clear : chip.params);
        return (
          <Link key={chip.label} prefetch={false} href={href as Route} aria-current={active ? "true" : undefined} className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition-colors ${active ? "border-[#111827] bg-[#111827] text-white" : "border-border bg-surface text-ink hover:border-border-strong"}`}>
            <chip.icon aria-hidden className="size-4" />{chip.label}
          </Link>
        );
      })}
      <details className="relative">
        <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-[10px] border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:border-border-strong">More filters</summary>
        <form action="/programs" method="get" className="absolute left-0 z-20 mt-2 grid w-[min(20rem,85vw)] gap-3 rounded-xl border border-border bg-surface p-4 shadow-xl">
          <input type="hidden" name="tab" value="all" />
          {Object.entries(current).filter(([k, v]) => v && !["assetType", "minBounty"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <label className="grid gap-1 text-[13px] font-medium text-ink">Asset type
            <select name="assetType" defaultValue={current.assetType ?? ""} className="h-9 rounded-lg border border-border bg-surface px-2 text-[13px]">
              <option value="">Any</option>
              {PROGRAM_ASSET_TYPES.map((t) => <option key={t} value={t}>{assetTypeLabel(t)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-[13px] font-medium text-ink">Minimum top bounty (whole units)
            <input type="number" name="minBounty" min={0} defaultValue={current.minBounty ?? ""} className="h-9 rounded-lg border border-border bg-surface px-2 text-[13px]" />
          </label>
          <button type="submit" className="h-9 rounded-lg bg-[#111827] text-[13px] font-semibold text-white">Apply</button>
        </form>
      </details>
    </nav>
  );
}

/** Programs whose focus areas overlap the researcher's own (a literal match, not a score). */
export function RecommendedStrip({ programs, rewardById }: { programs: RecommendedProgram[]; rewardById: Map<string, string> }) {
  if (programs.length === 0) return null;
  return (
    <section aria-labelledby="recommended-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="recommended-heading" className="flex items-center gap-2 text-[17px] font-semibold text-ink"><Sparkles aria-hidden className="size-5 text-[#F59E0B]" />Recommended For You</h2>
          <p className="text-[13px] text-ink-muted">Programs that share a focus area with your profile.</p>
        </div>
        <Link prefetch={false} href={"/settings/skills" as Route} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">Edit your interests<ArrowRight aria-hidden className="size-4" /></Link>
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {programs.slice(0, 4).map((p) => (
          <li key={p.id}>
            <Link prefetch={false} href={`/organizations/${p.organizationId}/programs/${p.id}` as Route} className="flex h-full items-center gap-3 rounded-xl border border-border bg-surface-muted/60 p-3 transition-colors hover:border-border-strong hover:bg-surface">
              <OrgLogo organizationId={p.organizationId} name={p.organizationName} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-ink">{p.name}</span>
                <span className="block truncate text-[12px] text-ink-muted">{rewardById.get(p.id) ?? p.organizationName}</span>
                <span className="mt-1 inline-block rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[11px] font-semibold text-[#027A48]">{p.focusAreas.slice(0, 1).map(focusAreaLabel).join("") || "Match"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type ResearcherProgress = { reports: number; accepted: number; evaluated: number; awarded: { currency: string; minor: number }[] };

/** The researcher's own record, from their reports and payments. */
export function ProgressRail({ progress, programs, invitations }: { progress: ResearcherProgress; programs: { id: string; organizationId: string; name: string; organizationName: string }[]; invitations: number }) {
  const rate = progress.evaluated > 0 ? Math.round((progress.accepted / progress.evaluated) * 100) : null;
  const circumference = 2 * Math.PI * 42;
  return (
    <aside className="min-w-0 space-y-4">
      <section aria-labelledby="progress-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between"><h2 id="progress-heading" className="text-[16px] font-semibold text-ink">Your Progress</h2><Link prefetch={false} href={"/reports" as Route} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">View Details<ArrowRight aria-hidden className="size-4" /></Link></div>
        <div className="mt-4 flex items-center gap-5">
          <div className="relative size-28 shrink-0" role="img" aria-label={rate === null ? "No evaluated reports yet" : `${rate}% of evaluated reports accepted`}>
            <svg viewBox="0 0 100 100" className="size-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#E7EAF0" strokeWidth="9" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="#12B76A" strokeWidth="9" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - (rate ?? 0) / 100)} />
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[22px] font-bold text-ink">{rate === null ? "--" : `${rate}%`}</span><span className="text-[10px] text-ink-muted">accepted</span></span>
          </div>
          <dl className="space-y-2">
            <div><dd className="text-[17px] font-bold text-ink">{progress.reports}</dd><dt className="text-[12px] text-ink-muted">Reports</dt></div>
            <div><dd className="text-[17px] font-bold text-ink">{progress.accepted}</dd><dt className="text-[12px] text-ink-muted">Accepted</dt></div>
            <div><dd className="text-[17px] font-bold text-ink">{progress.awarded.length ? progress.awarded.map((a) => formatMoney(a.minor, a.currency)).join(" + ") : "--"}</dd><dt className="text-[12px] text-ink-muted">Bounties awarded</dt></div>
          </dl>
        </div>
      </section>

      {invitations > 0 && (
        <Link prefetch={false} href={"/programs?tab=invitations" as Route} className="flex items-center justify-between rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] px-5 py-3 text-[13px] font-semibold text-[#1D4ED8]">
          {invitations} program {invitations === 1 ? "invitation" : "invitations"} waiting<ArrowRight aria-hidden className="size-4" />
        </Link>
      )}

      <section aria-labelledby="links-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 id="links-heading" className="text-[16px] font-semibold text-ink">Quick Links</h2>
        <ul className="mt-3 space-y-1">
          {([["My Reports", "/reports", FileText], ["Reputation", "/settings/reputation", Medal], ["Learning", "/learn", BookOpen], ["Leaderboard", "/researchers", Trophy]] as const).map(([label, href, Icon]) => (
            <li key={label}><Link prefetch={false} href={href as Route} className="flex items-center justify-between rounded-lg px-2 py-2 text-[14px] text-ink hover:bg-surface-hover"><span className="flex items-center gap-2.5"><Icon aria-hidden className="size-4 text-ink-muted" />{label}</span><ArrowRight aria-hidden className="size-4 text-ink-muted" /></Link></li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="mine-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between"><h2 id="mine-heading" className="text-[16px] font-semibold text-ink">Your Programs</h2><Link prefetch={false} href={"/programs?tab=mine" as Route} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">View all<ArrowRight aria-hidden className="size-4" /></Link></div>
        {programs.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-muted">Join a program to see it here.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {programs.slice(0, 4).map((p) => (
              <li key={p.id}><Link prefetch={false} href={`/organizations/${p.organizationId}/programs/${p.id}` as Route} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-hover"><OrgLogo organizationId={p.organizationId} name={p.organizationName} /><span className="min-w-0"><span className="block truncate text-[14px] font-medium text-ink">{p.name}</span><span className="block truncate text-[12px] text-ink-muted">{p.organizationName}</span></span></Link></li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

export function rewardLabel(p: PublicProgramSummary): string | null {
  return p.bountyMinMinorUnits !== null && p.bountyMaxMinorUnits !== null && p.bountyCurrency ? formatBountyRange(p.bountyMinMinorUnits, p.bountyMaxMinorUnits, p.bountyCurrency) : null;
}
