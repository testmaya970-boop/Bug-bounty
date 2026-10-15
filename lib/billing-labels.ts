import type { DepositMethod } from "@/services/billing";

export const DEPOSIT_METHOD_LABEL: Record<DepositMethod, string> = { upi: "UPI", imps: "IMPS", neft: "NEFT", rtgs: "RTGS", wire: "Wire transfer", ach: "ACH", card: "Card" };
