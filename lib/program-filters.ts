import { FOCUS_AREA_ORDER } from "@/lib/researcher-identity-labels";
import type { ProgramAssetType } from "@/types/scope";
import type { ProgramType } from "@/types/program";
import type { ResearcherFocusArea } from "@/types/researcher-identity";

export const PROGRAM_ASSET_TYPES: ProgramAssetType[] = ["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"];
export type ProgramSort = "recent" | "bounty" | "name";

/** Every discovery filter is applied by list_public_programs in the database (202610060014). */
export type PublicProgramFilters = {
  search?: string;
  status?: "active" | "paused";
  focusArea?: ResearcherFocusArea;
  assetType?: ProgramAssetType;
  programType?: ProgramType;
  /** Minimum top bounty, in minor units (whole currency x 100). */
  minBountyMinorUnits?: number;
  requiresKyc?: boolean;
  sort?: ProgramSort;
};

type Params = { q?: string; status?: string; focusArea?: string; assetType?: string; programType?: string; minBounty?: string; kyc?: string; sort?: string };

/** The registry's URL is its only state: parse it defensively, dropping anything invalid. */
export function parsePublicProgramFilters(params: Params): PublicProgramFilters {
  const minBounty = Number(params.minBounty);
  return {
    search: params.q?.trim() || undefined,
    status: params.status === "active" || params.status === "paused" ? params.status : undefined,
    focusArea: params.focusArea && (FOCUS_AREA_ORDER as string[]).includes(params.focusArea) ? (params.focusArea as ResearcherFocusArea) : undefined,
    assetType: params.assetType && (PROGRAM_ASSET_TYPES as string[]).includes(params.assetType) ? (params.assetType as ProgramAssetType) : undefined,
    programType: params.programType === "bounty" || params.programType === "vdp" ? params.programType : undefined,
    minBountyMinorUnits: Number.isFinite(minBounty) && minBounty > 0 ? Math.round(minBounty * 100) : undefined,
    requiresKyc: params.kyc === "required" ? true : params.kyc === "none" ? false : undefined,
    sort: params.sort === "bounty" || params.sort === "name" ? params.sort : undefined,
  };
}

export function hasActiveProgramFilter(filters: PublicProgramFilters): boolean {
  return Boolean(filters.search || filters.status || filters.focusArea || filters.assetType || filters.programType || filters.minBountyMinorUnits || filters.requiresKyc !== undefined);
}
