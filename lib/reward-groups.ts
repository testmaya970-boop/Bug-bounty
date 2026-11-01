import type {
  RewardColor,
  RewardIcon,
  RewardSeverity,
} from "../types/reward-groups";

export const REWARD_COLORS: Record<
  RewardColor,
  { label: string; dot: string; chip: string }
> = {
  slate: {
    label: "Slate",
    dot: "bg-slate-500",
    chip: "bg-slate-100 text-slate-800 border-slate-200",
  },
  red: {
    label: "Red",
    dot: "bg-red-500",
    chip: "bg-red-50 text-red-700 border-red-200",
  },
  orange: {
    label: "Orange",
    dot: "bg-orange-500",
    chip: "bg-orange-50 text-orange-700 border-orange-200",
  },
  amber: {
    label: "Amber",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
  },
  green: {
    label: "Green",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  teal: {
    label: "Teal",
    dot: "bg-teal-500",
    chip: "bg-teal-50 text-teal-700 border-teal-200",
  },
  blue: {
    label: "Blue",
    dot: "bg-blue-500",
    chip: "bg-blue-50 text-blue-700 border-blue-200",
  },
  violet: {
    label: "Violet",
    dot: "bg-violet-500",
    chip: "bg-violet-50 text-violet-700 border-violet-200",
  },
  pink: {
    label: "Pink",
    dot: "bg-pink-500",
    chip: "bg-pink-50 text-pink-700 border-pink-200",
  },
};

export const REWARD_ICONS: { key: RewardIcon; label: string }[] = [
  { key: "shield", label: "Shield" },
  { key: "server", label: "Server" },
  { key: "key", label: "Key & Auth" },
  { key: "globe", label: "Web & Edge" },
  { key: "device-mobile", label: "Mobile" },
  { key: "credit-card", label: "Payments" },
  { key: "bank", label: "Treasury" },
  { key: "cpu", label: "Compute" },
  { key: "code", label: "Source Code" },
  { key: "archive", label: "Storage" },
  { key: "heartbeat", label: "Health" },
  { key: "buildings", label: "Enterprise" },
  { key: "storefront", label: "Commerce" },
  { key: "robot", label: "AI & ML" },
  { key: "lock", label: "Vault" },
  { key: "database", label: "Database" },
];

export const REWARD_SEVERITIES: { key: RewardSeverity; label: string }[] = [
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];

export const REWARD_TEMPLATES: {
  key: "saas" | "banking" | "ai" | "ecommerce" | "healthcare" | "government";
  label: string;
  groups: string[];
}[] = [
  {
    key: "saas",
    label: "Enterprise SaaS",
    groups: [
      "Core Identity & Auth (Tier 1)",
      "Customer Data & APIs (Tier 2)",
      "Marketing & Docs (Tier 3)",
    ],
  },
  {
    key: "banking",
    label: "Fintech & Banking",
    groups: [
      "Ledger & Settlement Rails",
      "Account & KYC Flows",
      "Public Web & Portals",
    ],
  },
  {
    key: "ai",
    label: "AI & Model Platform",
    groups: [
      "Inference & Weight Isolation",
      "Agent & Tool Execution",
      "Developer Console",
    ],
  },
  {
    key: "ecommerce",
    label: "Commerce & Marketplace",
    groups: [
      "Checkout & Payment Vault",
      "Merchant & Order APIs",
      "Storefront & Catalog",
    ],
  },
  {
    key: "healthcare",
    label: "Healthcare & PHI",
    groups: [
      "EHR & Patient Records",
      "Provider Portal & APIs",
      "Public Informational Sites",
    ],
  },
  {
    key: "government",
    label: "Public Sector",
    groups: [
      "Citizen Identity & Records",
      "Agency Applications",
      "Public Information Portals",
    ],
  },
];
