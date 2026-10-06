import React from "react";
import { FOCUS_AREA_ORDER, focusAreaLabel } from "../../lib/researcher-identity-labels";
import { assetTypeLabel } from "../../lib/scope-labels";
import { PROGRAM_ASSET_TYPES, type PublicProgramFilters } from "../../lib/program-filters";

/**
 * The one real public-program search form, shared by both the signed-in registry
 * (app/programs/page.tsx's AllProgramsTab) and the anonymous/logged-out registry --
 * previously only the signed-in tab had this, so a logged-out visitor (the audience this
 * page is actually built to serve first, per docs/decisions/0041/0056) had no way to
 * search or filter at all. Extracted rather than copy-pasted so both surfaces can never
 * drift out of sync again. A plain GET form -- the URL is the only state, so
 * search -> reload -> identical results, and the filters survive a bookmark/share.
 */
const SELECT = "min-h-11 rounded-md border border-transparent bg-surface px-3 text-sm text-ink outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30";

export function PublicProgramSearchForm({ tab, filters }: { tab?: "all"; filters: PublicProgramFilters }) {
  const { search, status, focusArea } = filters;
  return (
    <form method="get" className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface-muted p-2">
      {tab && <input type="hidden" name="tab" value={tab} />}
      <label className="sr-only" htmlFor="public-program-search">
        Search public programs
      </label>
      <input
        id="public-program-search"
        type="text"
        name="q"
        defaultValue={search ?? ""}
        placeholder="Search by program or organization name"
        className="min-h-11 min-w-0 flex-1 rounded-md border border-transparent bg-surface px-3 font-mono text-sm text-ink outline-none placeholder:font-sans placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
      />
      <label className="sr-only" htmlFor="public-program-focus-area">
        Filter by focus area
      </label>
      <select
        id="public-program-focus-area"
        name="focusArea"
        defaultValue={focusArea ?? ""}
        className="min-h-11 rounded-md border border-transparent bg-surface px-3 text-sm text-ink outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
      >
        <option value="">All focus areas</option>
        {FOCUS_AREA_ORDER.map((area) => (
          <option key={area} value={area}>
            {focusAreaLabel(area)}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="public-program-status">
        Filter by status
      </label>
      <select
        id="public-program-status"
        name="status"
        defaultValue={status ?? ""}
        className="min-h-11 rounded-md border border-transparent bg-surface px-3 text-sm text-ink outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
      </select>
      <label className="sr-only" htmlFor="public-program-asset">
        Filter by asset type
      </label>
      <select id="public-program-asset" name="assetType" defaultValue={filters.assetType ?? ""} className={SELECT}>
        <option value="">All asset types</option>
        {PROGRAM_ASSET_TYPES.map((type) => (
          <option key={type} value={type}>
            {assetTypeLabel(type)}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="public-program-type">
        Filter by program type
      </label>
      <select id="public-program-type" name="programType" defaultValue={filters.programType ?? ""} className={SELECT}>
        <option value="">Bounty and disclosure</option>
        <option value="bounty">Pays bounties</option>
        <option value="vdp">Disclosure only</option>
      </select>
      <label className="sr-only" htmlFor="public-program-min-bounty">
        Minimum top bounty
      </label>
      <input
        id="public-program-min-bounty"
        type="number"
        name="minBounty"
        min={0}
        step={50}
        placeholder="Min. top bounty"
        defaultValue={filters.minBountyMinorUnits ? filters.minBountyMinorUnits / 100 : ""}
        className={SELECT + " w-40"}
      />
      <label className="sr-only" htmlFor="public-program-kyc">
        Identity verification
      </label>
      <select id="public-program-kyc" name="kyc" defaultValue={filters.requiresKyc === undefined ? "" : filters.requiresKyc ? "required" : "none"} className={SELECT}>
        <option value="">Any ID requirement</option>
        <option value="none">No ID verification</option>
        <option value="required">ID verification required</option>
      </select>
      <label className="sr-only" htmlFor="public-program-sort">
        Sort
      </label>
      <select id="public-program-sort" name="sort" defaultValue={filters.sort ?? "recent"} className={SELECT}>
        <option value="recent">Newest programs</option>
        <option value="bounty">Highest bounty</option>
        <option value="name">Name A-Z</option>
      </select>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-md bg-ink px-5 text-sm font-semibold text-canvas transition hover:bg-ink/85 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Search
      </button>
    </form>
  );
}
