export type PayoutBlocker = "payout_method_missing" | "tax_form_not_verified" | "kyc_not_verified" | "researcher_unavailable";

/** private.payout_blockers' codes (202610060008, 202610120002), in words. */
export const PAYOUT_BLOCKER_LABELS: Record<PayoutBlocker, string> = {
  payout_method_missing: "No payout method on file",
  tax_form_not_verified: "Tax form not yet verified",
  kyc_not_verified: "Identity (KYC) not verified -- this program requires it",
  researcher_unavailable: "The researcher's account is suspended or deactivated",
};

/** PAYOUT_NOT_READY's message lists raw codes; spell them out for people. */
export function describePayoutNotReady(message: string): string {
  const named = (Object.keys(PAYOUT_BLOCKER_LABELS) as PayoutBlocker[]).filter((code) => message.includes(code)).map((code) => PAYOUT_BLOCKER_LABELS[code].toLowerCase());
  return named.length > 0 ? `The researcher can't be paid yet: ${named.join("; ")}.` : message;
}
