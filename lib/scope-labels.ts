import type { ProgramAssetType, ScopeState } from "@/types/scope";

// Pure presentation logic, deliberately not in services/scope.ts (which is server-only)
// -- both server pages and client-rendered badges need it, the same reason
// lib/program-status.ts exists separately from services/programs.ts.

const ASSET_TYPE_LABELS: Record<ProgramAssetType, string> = {
  domain: "Domain",
  url: "URL",
  ip_cidr: "IP / CIDR",
  ios_app: "iOS app",
  android_app: "Android app",
  source_code: "Source code",
  hardware: "Hardware",
  ai_model: "AI model",
};

export function assetTypeLabel(assetType: ProgramAssetType): string {
  return ASSET_TYPE_LABELS[assetType];
}

const SCOPE_STATE_LABELS: Record<ScopeState, string> = {
  in_scope: "In scope",
  out_of_scope: "Out of scope",
};

export function scopeStateLabel(state: ScopeState): string {
  return SCOPE_STATE_LABELS[state];
}
