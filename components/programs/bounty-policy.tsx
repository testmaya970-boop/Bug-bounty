"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/form";
import { createBountyPolicyVersionAction } from "../../actions/bounty";
import { minorUnitsToDecimalString, parseDecimalToMinorUnits } from "../../lib/money";
import type { BountyPolicy } from "../../types/bounty";
import type { ReportSeverity } from "../../types/report";
import { priorityForSeverity, priorityLabel } from "../../lib/report-priority";

// Payout ranges are per PRIORITY (P0-P4). Policies store them keyed by tier (critical..none),
// and each tier is exactly one priority, so P0 first. See lib/report-priority.ts.
const SEVERITY_TIERS: ReportSeverity[] = ["critical", "high", "medium", "low", "none"];
const SEVERITY_LABELS = Object.fromEntries(SEVERITY_TIERS.map((tier) => [tier, priorityLabel(priorityForSeverity(tier))])) as Record<ReportSeverity, string>;

/** Ranges where a lower priority can pay more than a higher one: allowed, but almost always a typo. */
function inversions(parsed: Record<ReportSeverity, { min: number; max: number }>): string[] {
  const out: string[] = [];
  for (let i = 0; i < SEVERITY_TIERS.length - 1; i++) {
    const higher = SEVERITY_TIERS[i];
    const lower = SEVERITY_TIERS[i + 1];
    if (parsed[lower].max > parsed[higher].max) out.push(`${SEVERITY_LABELS[lower]} can pay more than ${SEVERITY_LABELS[higher]}.`);
  }
  return out;
}

/** Read-only display of the program's current effective bounty policy -- or the honest
 * absence of one. See docs/decisions/0013-bounty-decision-engine.md. */
export function BountyPolicySection({ policy }: { policy: BountyPolicy | null }) {
  if (!policy) {
    return <p className="text-sm text-ink-muted">This program has not configured a bounty policy. Reports are not bounty-eligible until one is created.</p>;
  }

  return (
    <div>
      <p className="text-sm text-ink-muted">
        Paid in {policy.currency}
      </p>
      <p className="mt-1 text-xs text-ink-muted">Ranges are per priority. A report&apos;s priority follows its confirmed severity unless a triager sets it.</p>
      <table className="mt-3 w-full max-w-md text-left text-sm">
        <thead className="text-xs text-ink-muted">
          <tr>
            <th scope="col" className="py-1 pr-3 font-semibold">
              Priority
            </th>
            <th scope="col" className="py-1 pr-3 font-semibold">
              Minimum
            </th>
            <th scope="col" className="py-1 font-semibold">
              Maximum
            </th>
          </tr>
        </thead>
        <tbody>
          {SEVERITY_TIERS.map((severity) => {
            const range = policy.ranges.find((r) => r.severity === severity);
            return (
              <tr key={severity} className="border-t border-border">
                <td className="py-1.5 pr-3">{SEVERITY_LABELS[severity]}</td>
                <td className="py-1.5 pr-3 font-mono">{range ? minorUnitsToDecimalString(range.minAmountMinorUnits) : "--"}</td>
                <td className="py-1.5 font-mono">{range ? minorUnitsToDecimalString(range.maxAmountMinorUnits) : "--"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type RangeInputs = Record<ReportSeverity, { min: string; max: string }>;

function defaultRangeInputs(policy: BountyPolicy | null): RangeInputs {
  const blank = { min: "0.00", max: "0.00" };
  const result = { none: blank, low: blank, medium: blank, high: blank, critical: blank } as RangeInputs;
  if (!policy) return result;
  for (const severity of SEVERITY_TIERS) {
    const range = policy.ranges.find((r) => r.severity === severity);
    if (range) result[severity] = { min: minorUnitsToDecimalString(range.minAmountMinorUnits), max: minorUnitsToDecimalString(range.maxAmountMinorUnits) };
  }
  return result;
}

/** Two-step: collect the new policy, then show a computed preview of exactly what will
 * be published before committing -- the same "collect input, then show a calculated
 * impact summary" pattern DESIGN.md requires for every consequential action (see
 * components/organizations/role-change-dialog.tsx). Publishing a new version supersedes
 * the current one; it never edits it. */
export function CreateBountyPolicyDialog({ organizationId, programId, currentPolicy }: { organizationId: string; programId: string; currentPolicy: BountyPolicy | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [currency, setCurrency] = useState<"USD" | "INR">(currentPolicy?.currency === "INR" ? "INR" : "USD");
  const [ranges, setRanges] = useState<RangeInputs>(() => defaultRangeInputs(currentPolicy));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setStep("edit");
    setCurrency(currentPolicy?.currency === "INR" ? "INR" : "USD");
    setRanges(defaultRangeInputs(currentPolicy));
    setError(null);
  }

  function parsedRanges(): Record<ReportSeverity, { min: number; max: number }> | null {
    const result = {} as Record<ReportSeverity, { min: number; max: number }>;
    for (const severity of SEVERITY_TIERS) {
      const min = parseDecimalToMinorUnits(ranges[severity].min);
      const max = parseDecimalToMinorUnits(ranges[severity].max);
      if (min === null || max === null || min > max) return null;
      result[severity] = { min, max };
    }
    return result;
  }

  function handleContinue() {
    const parsed = parsedRanges();
    if (!parsed) {
      setError("Enter a valid amount for every priority, with minimum no greater than maximum.");
      return;
    }
    if (parsed.critical.max === 0) {
      setError("A bounty table must pay something: set at least the P0 maximum above zero.");
      return;
    }
    setError(null);
    setStep("confirm");
  }

  function handleConfirm() {
    const parsed = parsedRanges();
    if (!parsed) return;
    setError(null);
    startTransition(async () => {
      const result = await createBountyPolicyVersionAction({ organizationId, programId, currency, ranges: parsed });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setStep("edit");
      router.refresh();
    });
  }

  const parsed = step === "confirm" ? parsedRanges() : null;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {currentPolicy ? "Publish new policy version" : "Configure bounty policy"}
      </Button>
      <Dialog open={open} title={currentPolicy ? "Publish a new bounty policy version" : "Configure bounty policy"} onClose={close}>
        {step === "edit" ? (
          <div className="space-y-4">
            {currentPolicy && (
              <p className="text-sm text-ink-muted">
                This replaces the current table. Reports already calculated or finalized under it are never affected.
              </p>
            )}
            {/* Awards are paid from the prepaid balance, which holds INR and USD only. */}
            <Select label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value === "INR" ? "INR" : "USD")} className="max-w-32">
              <option value="USD">USD</option>
              <option value="INR">INR</option>
            </Select>
            <div className="space-y-2">
              {SEVERITY_TIERS.map((severity) => (
                <div key={severity} className="flex flex-wrap items-end gap-2">
                  <span className="w-32 pb-2.5 text-sm font-medium text-ink">{SEVERITY_LABELS[severity]}</span>
                  <Input
                    label="Minimum"
                    value={ranges[severity].min}
                    onChange={(event) => setRanges((prev) => ({ ...prev, [severity]: { ...prev[severity], min: event.target.value } }))}
                    className="max-w-28"
                  />
                  <Input
                    label="Maximum"
                    value={ranges[severity].max}
                    onChange={(event) => setRanges((prev) => ({ ...prev, [severity]: { ...prev[severity], max: event.target.value } }))}
                    className="max-w-28"
                  />
                </div>
              ))}
            </div>
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="button" onClick={handleContinue}>
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">This will become the program's effective bounty policy immediately.</p>
            {parsed && inversions(parsed).length > 0 && (
              <div role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-ink">
                <p className="font-semibold">Check these ranges before publishing:</p>
                <ul className="mt-1 list-disc pl-5">
                  {inversions(parsed).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-muted">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-semibold">
                    Priority
                  </th>
                  <th scope="col" className="py-1 pr-3 font-semibold">
                    Minimum
                  </th>
                  <th scope="col" className="py-1 font-semibold">
                    Maximum
                  </th>
                </tr>
              </thead>
              <tbody>
                {SEVERITY_TIERS.map((severity) => (
                  <tr key={severity} className="border-t border-border">
                    <td className="py-1.5 pr-3">{SEVERITY_LABELS[severity]}</td>
                    <td className="py-1.5 pr-3 font-mono">
                      {currency.toUpperCase()} {parsed ? minorUnitsToDecimalString(parsed[severity].min) : ranges[severity].min}
                    </td>
                    <td className="py-1.5 font-mono">
                      {currency.toUpperCase()} {parsed ? minorUnitsToDecimalString(parsed[severity].max) : ranges[severity].max}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep("edit")} disabled={pending}>
                Back
              </Button>
              <Button type="button" pending={pending} onClick={handleConfirm}>
                Publish policy
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
