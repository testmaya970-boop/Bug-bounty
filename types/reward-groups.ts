// Reward groups (202610300001): named categories of assets, each with its own bounty table.

export type RewardSeverity = "critical" | "high" | "medium" | "low" | "none";
export type RewardRange = { min: number; max: number };
export type RewardColor = "slate" | "red" | "orange" | "amber" | "green" | "teal" | "blue" | "violet" | "pink";
export type RewardIcon =
  | "shield" | "server" | "key" | "globe" | "device-mobile" | "credit-card" | "bank" | "cpu"
  | "code" | "archive" | "heartbeat" | "buildings" | "storefront" | "robot" | "lock" | "database";

export type RewardGroup = {
  id: string;
  name: string;
  description: string | null;
  color: RewardColor;
  icon: RewardIcon;
  currency: "INR" | "USD";
  sortOrder: number;
  isDefault: boolean;
  archived: boolean;
  assetCount: number;
  bounties: Partial<Record<RewardSeverity, RewardRange>>;
};

export type RewardSuggestion = {
  assetLabel: string | null;
  groupId: string | null;
  groupName: string | null;
  groupColor: RewardColor | null;
  severity: RewardSeverity | null;
  /** Where the range came from: the asset's reward group, the program's own table, or nowhere yet. */
  source: "reward_group" | "program" | "none";
  currency: string | null;
  min: number | null;
  max: number | null;
};
