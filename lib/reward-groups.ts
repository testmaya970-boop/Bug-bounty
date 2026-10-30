import type { RewardColor, RewardIcon, RewardSeverity } from "../types/reward-groups";

// Display constants for reward groups, shared by server and client components.

export const REWARD_SEVERITIES: { key: RewardSeverity; label: string }[] = [
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
  { key: "none", label: "Informational" },
];

/** Swatch classes per color: a tinted chip and a solid dot. Literal strings so Tailwind keeps them. */
export const REWARD_COLORS: Record<RewardColor, { label: string; chip: string; dot: string }> = {
  slate: { label: "Slate", chip: "bg-slate-500/12 text-slate-700 dark:text-slate-300", dot: "bg-slate-500" },
  red: { label: "Red", chip: "bg-red-500/12 text-red-700 dark:text-red-300", dot: "bg-red-500" },
  orange: { label: "Orange", chip: "bg-orange-500/12 text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  amber: { label: "Amber", chip: "bg-amber-500/15 text-amber-800 dark:text-amber-300", dot: "bg-amber-500" },
  green: { label: "Green", chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  teal: { label: "Teal", chip: "bg-teal-500/12 text-teal-700 dark:text-teal-300", dot: "bg-teal-500" },
  blue: { label: "Blue", chip: "bg-blue-500/12 text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  violet: { label: "Violet", chip: "bg-violet-500/12 text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  pink: { label: "Pink", chip: "bg-pink-500/12 text-pink-700 dark:text-pink-300", dot: "bg-pink-500" },
};

export const REWARD_ICONS: { key: RewardIcon; label: string }[] = [
  { key: "shield", label: "Shield" },
  { key: "server", label: "Server" },
  { key: "key", label: "Key" },
  { key: "globe", label: "Website" },
  { key: "device-mobile", label: "Mobile" },
  { key: "credit-card", label: "Payments" },
  { key: "bank", label: "Bank" },
  { key: "cpu", label: "Compute" },
  { key: "code", label: "API" },
  { key: "database", label: "Data" },
  { key: "robot", label: "AI" },
  { key: "heartbeat", label: "Health" },
  { key: "buildings", label: "Business" },
  { key: "storefront", label: "Store" },
  { key: "lock", label: "Secure" },
  { key: "archive", label: "Legacy" },
];

export const REWARD_TEMPLATES: { key: string; label: string; groups: string[] }[] = [
  { key: "saas", label: "SaaS", groups: ["Core Platform", "Authentication", "Mobile Apps", "Public Website", "Legacy"] },
  { key: "banking", label: "Banking", groups: ["Internet Banking", "Payments", "Cards", "ATM", "Corporate Banking"] },
  { key: "ai", label: "AI company", groups: ["AI APIs", "Inference", "Models", "Playground", "Developer Platform"] },
  { key: "ecommerce", label: "E-commerce", groups: ["Checkout & Payments", "Customer Accounts", "Storefront", "Seller Platform", "Mobile Apps"] },
  { key: "healthcare", label: "Healthcare", groups: ["Health Records", "Patient Portal", "Clinical Systems", "Telehealth", "Public Website"] },
  { key: "government", label: "Government", groups: ["Identity & Authentication", "Citizen Services", "Payments & Taxes", "Internal Systems", "Public Information"] },
];
