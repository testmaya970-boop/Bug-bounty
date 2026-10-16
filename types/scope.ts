export type ProgramAssetType = "domain" | "url" | "ip_cidr" | "ios_app" | "android_app" | "source_code" | "hardware" | "ai_model";
export type ScopeState = "in_scope" | "out_of_scope";
export type ScopeEntryStatus = "active" | "removed";

export type ScopeEntry = {
  id: string;
  programId: string;
  organizationId: string;
  assetType: ProgramAssetType;
  target: string;
  displayTarget: string;
  scopeState: ScopeState;
  description: string | null;
  status: ScopeEntryStatus;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  removedAt: string | null;
};

/** The result of asking "is this target covered by this program's scope right now" --
 * see services/scope.ts's evaluateProgramScope and docs/decisions/0006-scope-asset-model.md.
 * Not a researcher-facing capability yet; internal to authorized program managers/admins. */
export type ScopeEvaluationResult = {
  isInScope: boolean;
  matchedScopeState: ScopeState | null;
  matchedEntryId: string | null;
  matchedTarget: string | null;
};

/** One asset in an organization's inventory (public.assets, 202610160009). */
export type AssetInventoryItem = {
  id: string;
  assetType: ProgramAssetType;
  displayIdentifier: string;
  programs: { program_id: string; program_name: string; scope_state: ScopeState }[];
  openReports: number;
  totalReports: number;
  lastReportAt: string | null;
};
