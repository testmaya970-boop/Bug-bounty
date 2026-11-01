export type RewardColor =
  | "slate"
  | "red"
  | "orange"
  | "amber"
  | "green"
  | "teal"
  | "blue"
  | "violet"
  | "pink";

export type RewardIcon =
  | "shield"
  | "server"
  | "key"
  | "globe"
  | "device-mobile"
  | "credit-card"
  | "bank"
  | "cpu"
  | "code"
  | "archive"
  | "heartbeat"
  | "buildings"
  | "storefront"
  | "robot"
  | "lock"
  | "database";

export type RewardSeverity = "critical" | "high" | "medium" | "low" | "none";

export interface RewardGroup {
  id: string;
  organizationId?: string;
  name: string;
  description: string | null;
  color: RewardColor;
  icon: RewardIcon;
  currency: "INR" | "USD";
  isDefault: boolean;
  archived: boolean;
  assetCount: number;
  bounties: Partial<Record<RewardSeverity, { min: number; max: number }>>;
}
