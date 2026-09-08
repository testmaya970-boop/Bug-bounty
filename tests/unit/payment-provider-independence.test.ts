import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Proves docs/decisions/0014-payment-ledger-and-payout-orchestration.md's central claim:
// the payment domain never imports a provider SDK. Only lib/payment-provider.ts (the
// adapter boundary itself) may ever gain one, when a real provider is added -- and even
// then, only inside a new PaymentProvider implementation, never inside services/payments.ts.

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const PROVIDER_SDK_PATTERN = /stripe|razorpay|paypal/i;

function read(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, "utf8");
}

describe("payment provider independence: the domain service never imports a payment provider SDK", () => {
  it("services/payments.ts contains no provider SDK reference and imports only the provider abstraction", () => {
    const source = read("services/payments.ts");
    expect(source).not.toMatch(PROVIDER_SDK_PATTERN);
    expect(source).toContain('import { activePaymentProvider } from "@/lib/payment-provider"');
    expect(source).not.toMatch(/from ["']stripe["']|from ["']razorpay["']/i);
  });

  it("actions/payments.ts (the Server Action boundary) contains no provider SDK reference", () => {
    const source = read("actions/payments.ts");
    expect(source).not.toMatch(PROVIDER_SDK_PATTERN);
  });

  it("components/reports/payment-status.tsx (the UI layer) contains no provider SDK reference", () => {
    const source = read("components/reports/payment-status.tsx");
    expect(source).not.toMatch(PROVIDER_SDK_PATTERN);
  });

  it("the migration itself contains no provider SDK reference -- the database owns its own ids and state, never a provider's", () => {
    const source = read("supabase/migrations/202608290001_payment_ledger_and_payout_orchestration.sql");
    expect(source).not.toMatch(PROVIDER_SDK_PATTERN);
  });

  it("package.json lists no Stripe/Razorpay/PayPal dependency -- the abstraction was proven without installing one", () => {
    const packageJson = JSON.parse(read("package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    for (const name of Object.keys(allDeps)) {
      expect(name.toLowerCase()).not.toMatch(/stripe|razorpay|paypal/);
    }
  });
});

describe("payment provider independence: exactly one file may define a PaymentProvider implementation", () => {
  it("lib/payment-provider.ts is the only file exporting a PaymentProvider-shaped object in this slice", () => {
    const source = read("lib/payment-provider.ts");
    expect(source).toContain("export type PaymentProvider = {");
    expect(source).toContain("export const manualPaymentProvider: PaymentProvider = {");
    expect(source).toContain("export const activePaymentProvider: PaymentProvider = manualPaymentProvider");
  });

  it("the manual provider never returns a terminal 'succeeded' outcome from createPayment -- only an operator action can", () => {
    const source = read("lib/payment-provider.ts");
    const createPaymentStart = source.indexOf("async createPayment()");
    const createPaymentEnd = source.indexOf("},", createPaymentStart);
    const createPaymentBody = source.slice(createPaymentStart, createPaymentEnd);
    expect(createPaymentBody).toContain("requires_operator_action");
    expect(createPaymentBody).not.toContain("succeeded");
  });
});
