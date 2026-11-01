import { minorUnitsToDecimalString } from "./money";
import type { ReportStatus } from "../types/report";
import type { MyPaymentObligation } from "../services/payments";

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", INR: "₹" };

/**
 * The researcher home dashboard's real stat-rail figures (app/page.tsx's CommandRow),
 * replacing the previously fabricated lib/mock/researcher-dashboard.ts's
 * MOCK_RESEARCHER_STATUS -- every signed-in researcher, including a brand-new account
 * with zero real activity, previously saw hardcoded "37 submissions, 22 accepted, $4,150
 * lifetime rewards" with no disclosure. Pulled into its own pure function so the
 * derivation (true totals, not myReportsPage's MAX_PAGE_SIZE-capped page; the
 * never-blend-currencies rule) is directly testable without rendering the async Server
 * Component page.
 */
export function computeResearcherDashboardStatus(input: {
  activeProgramCount: number;
  reportStatusCounts: { status: ReportStatus; count: number }[];
  reputationScore: number;
  paymentObligations: MyPaymentObligation[];
}): { programsFollowed: number; submissions: number; acceptedReports: number; reputationPoints: number; lifetimeRewardsLabel: string } {
  const submissions = input.reportStatusCounts.reduce((sum, entry) => sum + entry.count, 0);
  const acceptedReports = input.reportStatusCounts
    .filter((entry) => entry.status === "accepted" || entry.status === "resolved")
    .reduce((sum, entry) => sum + entry.count, 0);

  return {
    programsFollowed: input.activeProgramCount,
    submissions,
    acceptedReports,
    reputationPoints: input.reputationScore,
    lifetimeRewardsLabel: formatLifetimeRewards(input.paymentObligations),
  };
}

function formatLifetimeRewards(paymentObligations: MyPaymentObligation[]): string {
  const succeeded = paymentObligations.filter((o) => o.status === "succeeded");
  if (succeeded.length === 0) return "$0";

  const currencies = new Set(succeeded.map((o) => o.currency));
  // Never blend across currencies into one fabricated total -- the same discipline
  // components/payments/bounty-track-record.tsx's own sumByCurrency already follows. A
  // researcher paid in more than one currency sees the count of paid bounties instead of
  // a misleading combined figure.
  if (currencies.size > 1) return `${succeeded.length} paid`;

  const total = succeeded.reduce((sum, o) => sum + o.amountMinorUnits, 0);
  const [currency] = currencies;
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  return `${symbol}${minorUnitsToDecimalString(total)}`;
}
