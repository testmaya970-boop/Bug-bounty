import type {
  RewardColor,
  RewardGroup,
  RewardIcon,
  RewardSeverity,
} from "../types/reward-groups";

const MOCK_REWARD_GROUPS: RewardGroup[] = [
  {
    id: "rg-tier-1-core",
    name: "Core Identity & Control Plane (Tier 1)",
    description:
      "Production authentication, SSO/SAML brokers, IAM token issuers, and multi-tenant isolation boundaries.",
    color: "violet",
    icon: "key",
    currency: "USD",
    isDefault: true,
    archived: false,
    assetCount: 6,
    bounties: {
      critical: { min: 1000000, max: 2500000 },
      high: { min: 400000, max: 1000000 },
      medium: { min: 100000, max: 350000 },
      low: { min: 25000, max: 75000 },
    },
  },
  {
    id: "rg-tier-2-edge",
    name: "Edge APIs & Customer Workloads (Tier 2)",
    description:
      "Public GraphQL/REST gateways, billing webhooks, regional ingestion pipelines, and customer workspace APIs.",
    color: "blue",
    icon: "server",
    currency: "USD",
    isDefault: false,
    archived: false,
    assetCount: 9,
    bounties: {
      critical: { min: 500000, max: 1200000 },
      high: { min: 200000, max: 500000 },
      medium: { min: 75000, max: 200000 },
      low: { min: 15000, max: 50000 },
    },
  },
  {
    id: "rg-tier-3-web",
    name: "Public Web & Developer Docs (Tier 3)",
    description:
      "Marketing properties, documentation portals, status pages, and sandbox demo environments.",
    color: "teal",
    icon: "globe",
    currency: "USD",
    isDefault: false,
    archived: false,
    assetCount: 4,
    bounties: {
      critical: { min: 150000, max: 350000 },
      high: { min: 75000, max: 150000 },
      medium: { min: 25000, max: 75000 },
      low: { min: 10000, max: 25000 },
    },
  },
];

export type RewardGroupInput = {
  name: string;
  description: string | null;
  color: RewardColor;
  icon: RewardIcon;
  currency: "INR" | "USD";
  isDefault?: boolean;
  bounties:
    | Partial<Record<RewardSeverity, { min: number; max: number }>>
    | { severity: RewardSeverity; min: number; max: number }[];
};

export async function listRewardGroups(
  organizationId: string,
): Promise<{ groups: RewardGroup[]; canManage: boolean }> {
  return {
    groups: MOCK_REWARD_GROUPS.map((g) => ({
      ...g,
      organizationId,
    })),
    canManage: true,
  };
}

export async function listAssetRewardGroups(
  _organizationId: string,
): Promise<{ byAsset: Record<string, string | null>; canEdit: boolean }> {
  return { byAsset: {}, canEdit: true };
}

export async function getReportRewardSuggestion(_reportId: string): Promise<{
  assetLabel: string | null;
  groupName: string | null;
  groupColor: RewardColor | null;
  severity: RewardSeverity | null;
  min: number | null;
  max: number | null;
  currency: "INR" | "USD" | null;
  source: "reward_group" | "program" | null;
} | null> {
  return {
    assetLabel: "auth.northwind.cloud",
    groupName: "Core Identity & Control Plane (Tier 1)",
    groupColor: "violet",
    severity: "critical",
    min: 1000000,
    max: 2500000,
    currency: "USD",
    source: "reward_group",
  };
}

export async function createRewardGroup(
  _organizationId: string,
  _input: RewardGroupInput,
): Promise<void> {}

export async function updateRewardGroup(
  _groupId: string,
  _input: RewardGroupInput,
): Promise<void> {}

export async function duplicateRewardGroup(_groupId: string): Promise<void> {}

export async function reorderRewardGroups(
  _organizationId: string,
  _groupIds: string[],
): Promise<void> {}

export async function setDefaultRewardGroup(_groupId: string): Promise<void> {}

export async function archiveRewardGroup(
  _groupId: string,
  _archive: boolean,
): Promise<void> {}

export async function deleteRewardGroup(_groupId: string): Promise<void> {}

export async function applyRewardGroupTemplate(
  _organizationId: string,
  _template: string,
  _currency: "INR" | "USD",
): Promise<void> {}

export async function setAssetRewardGroup(
  _assetId: string,
  _groupId: string | null,
): Promise<void> {}
