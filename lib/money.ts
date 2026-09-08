/**
 * Every bounty amount is an integer of minor units (cents) end to end -- server, database,
 * and the wire. These two functions are the only place a human-readable decimal string
 * ever touches an amount, and neither uses floating-point arithmetic (no `parseFloat`
 * multiplication, which can misround, e.g. 0.1 + 0.2 !== 0.3) -- both are pure string
 * manipulation. See docs/decisions/0013-bounty-decision-engine.md.
 *
 * Assumes a two-decimal-digit currency (USD/EUR/INR-style). A currency with a different
 * minor-unit convention (JPY has none, BHD has three) is a disclosed simplification, not
 * silently handled -- the same "shape-validated, not list-validated" treatment 0013 gives
 * the currency code itself.
 */

export function minorUnitsToDecimalString(amountMinorUnits: number): string {
  const sign = amountMinorUnits < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(amountMinorUnits));
  const wholePart = Math.trunc(abs / 100);
  const centsPart = abs % 100;
  return `${sign}${wholePart}.${String(centsPart).padStart(2, "0")}`;
}

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", INR: "₹" };

/** A compact, human-readable range for a program card -- e.g. "$0 - $5,000". Whole-dollar
 * amounts round to the nearest whole unit for display only (the real stored value stays
 * exact minor units everywhere else); an unrecognized currency code falls back to showing
 * the code itself rather than guessing a symbol. */
export function formatBountyRange(minMinorUnits: number, maxMinorUnits: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const format = (minorUnits: number) => `${symbol}${Math.round(minorUnits / 100).toLocaleString("en-US")}`;
  return `${format(minMinorUnits)} - ${format(maxMinorUnits)}`;
}

/** A single amount, e.g. "$12,500" -- the single-value counterpart to formatBountyRange
 * above, for real spend totals (never a min-max range). Same whole-dollar display
 * rounding and unrecognized-currency fallback. */
export function formatMoney(amountMinorUnits: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  return `${symbol}${Math.round(amountMinorUnits / 100).toLocaleString("en-US")}`;
}

/** Returns null for anything that is not a plain non-negative number with at most two
 * decimal digits -- never throws, never silently truncates precision. */
export function parseDecimalToMinorUnits(input: string): number | null {
  const trimmed = input.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return null;
  const whole = match[1];
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const value = Number.parseInt(`${whole}${fraction}`, 10);
  return Number.isSafeInteger(value) ? value : null;
}
