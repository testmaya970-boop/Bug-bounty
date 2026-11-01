"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/form";
import {
  setBalanceAlertAction,
  setProgramBudgetAction,
  upsertBillingProfileAction,
  type ActionResult,
} from "../../actions/billing";
import { minorUnitsToDecimalString } from "../../lib/money";
import { BILLING_COUNTRIES, GST_STATES } from "../../lib/countries";
import type {
  BalanceAlert,
  BillingProfile,
  ProgramBudget,
} from "../../services/billing";

type Currency = "INR" | "USD";
const CURRENCIES: Currency[] = ["INR", "USD"];
const toInput = (minor: number | null | undefined) =>
  minor ? minorUnitsToDecimalString(minor) : "";

/** One save button's pending / error / saved state. */
function useSave() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  function save(action: () => Promise<ActionResult>, savedText = "Saved.") {
    startTransition(async () => {
      setMessage(null);
      const result = await action();
      setMessage(
        result.ok
          ? { ok: true, text: savedText }
          : { ok: false, text: result.message },
      );
      if (result.ok) router.refresh();
    });
  }
  const note = message && (
    <p
      role={message.ok ? "status" : "alert"}
      className={`text-xs font-medium ${message.ok ? "text-success" : "text-danger"}`}
    >
      {message.text}
    </p>
  );
  return { pending, save, note };
}

function AlertRow({
  organizationId,
  currency,
  alert,
}: {
  organizationId: string;
  currency: Currency;
  alert?: BalanceAlert;
}) {
  const [threshold, setThreshold] = useState(
    toInput(alert?.thresholdMinorUnits),
  );
  const { pending, save, note } = useSave();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save(
          () => setBalanceAlertAction({ organizationId, currency, threshold }),
          threshold ? "Alert saved." : "Alert turned off.",
        );
      }}
    >
      <Input
        className="min-w-0 flex-1 basis-40"
        label={`Alert below (${currency})`}
        inputMode="decimal"
        placeholder="Off"
        value={threshold}
        onChange={(event) => setThreshold(event.target.value)}
        helperText={
          alert?.alerted
            ? "Your balance is below this now. You were notified."
            : undefined
        }
      />
      <Button
        type="submit"
        variant="secondary"
        pending={pending}
        className="mb-[1px]"
      >
        Save
      </Button>
      <div className="basis-full">{note}</div>
    </form>
  );
}

/** Owners, security and billing admins get an in-app and email notice the moment available
 * funds drop below a threshold, once per drop. */
export function BalanceAlertsForm({
  organizationId,
  alerts,
}: {
  organizationId: string;
  alerts: BalanceAlert[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {CURRENCIES.map((currency) => (
        <AlertRow
          key={currency}
          organizationId={organizationId}
          currency={currency}
          alert={alerts.find((a) => a.currency === currency)}
        />
      ))}
    </div>
  );
}

function BudgetRow({
  organizationId,
  budget,
}: {
  organizationId: string;
  budget: ProgramBudget;
}) {
  const [currency, setCurrency] = useState<Currency>(budget.currency ?? "USD");
  const [cap, setCap] = useState(toInput(budget.capMinorUnits));
  const [editing, setEditing] = useState(false);
  const { pending, save, note } = useSave();
  const used = budget.usedMinorUnits ?? 0;
  const ratio = budget.capMinorUnits
    ? Math.min(1, used / budget.capMinorUnits)
    : 0;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{budget.programName}</p>
        {budget.capMinorUnits ? (
          <>
            <p className="mt-0.5 font-mono text-xs tabular-nums text-ink-muted">
              {budget.currency} {minorUnitsToDecimalString(used)} of{" "}
              {minorUnitsToDecimalString(budget.capMinorUnits)} awarded
            </p>
            <div
              className="mt-1.5 h-1.5 max-w-xs overflow-hidden rounded-full bg-surface-muted"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ratio * 100)}
              aria-label="Budget used"
            >
              <div
                className={`h-full ${ratio >= 0.9 ? "bg-danger" : ratio >= 0.7 ? "bg-warning" : "bg-action"}`}
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          </>
        ) : (
          <p className="mt-0.5 text-xs text-ink-muted">
            No limit. Awards draw on the whole balance.
          </p>
        )}
      </div>
      {!editing ? (
        <div className="flex items-center gap-3">
          {note}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setEditing(true)}
          >
            {budget.capMinorUnits ? "Change budget" : "Set budget"}
          </Button>
        </div>
      ) : (
        <form
          className="flex basis-full flex-wrap items-end gap-2 md:basis-auto"
          onSubmit={(event) => {
            event.preventDefault();
            save(
              () =>
                setProgramBudgetAction({
                  organizationId,
                  programId: budget.programId,
                  currency,
                  cap,
                }),
              cap ? "Budget saved." : "Limit removed.",
            );
          }}
        >
          <Select
            className="w-24"
            label="Currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as Currency)}
          >
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Input
            className="min-w-0 flex-1 basis-28"
            label="Budget"
            inputMode="decimal"
            placeholder="No limit"
            value={cap}
            onChange={(event) => setCap(event.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            pending={pending}
            className="mb-[1px]"
          >
            Save
          </Button>
          <Button
            type="button"
            variant="quiet"
            className="mb-[1px]"
            onClick={() => setEditing(false)}
          >
            Done
          </Button>
          <div className="basis-full">{note}</div>
        </form>
      )}
    </li>
  );
}

/** A cap per program on what is committed (awarded or paid): the bounty, plus the fee only on
 * awards from before 202610230001. An award that would cross it
 * is refused by the database, so one program can't drain the balance meant for all of them. */
export function ProgramBudgetsList({
  organizationId,
  budgets,
}: {
  organizationId: string;
  budgets: ProgramBudget[];
}) {
  if (budgets.length === 0)
    return <p className="text-sm text-ink-muted">No open programs yet.</p>;
  return (
    <ul aria-label="Program budgets" className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
      {budgets.map((b) => (
        <BudgetRow
          key={b.programId}
          organizationId={organizationId}
          budget={b}
        />
      ))}
    </ul>
  );
}

/** Who the invoice is made out to. A GSTIN gets the GST shown on the invoice. Before the first
 * save the form starts from what we already know (defaults): the organization's name and its
 * likely country, so most organizations only add an address. */
export function BillingProfileForm({
  organizationId,
  profile,
  defaults,
}: {
  organizationId: string;
  profile: BillingProfile | null;
  defaults: { legalName: string; country: string };
}) {
  const [form, setForm] = useState({
    legalName: profile?.legalName ?? defaults.legalName,
    gstin: profile?.gstin ?? "",
    addressLine: profile?.addressLine ?? "",
    city: profile?.city ?? "",
    postalCode: profile?.postalCode ?? "",
    country: profile?.country ?? defaults.country,
    stateCode: profile?.stateCode ?? "",
  });
  const { pending, save, note } = useSave();
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [key]: event.target.value }),
  });
  const india = form.country.trim().toUpperCase() === "IN";
  return (
    <form
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save(
          () =>
            upsertBillingProfileAction({
              organizationId,
              ...form,
              // GSTIN and GST state apply to Indian companies only.
              gstin: india ? form.gstin : "",
              stateCode: india ? form.stateCode : "",
            }),
          "Billing details saved.",
        );
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Legal name"
          required
          maxLength={200}
          {...field("legalName")}
        />
        <Select label="Country" required {...field("country")}>
          {BILLING_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input
          className="sm:col-span-2"
          label="Address"
          required
          maxLength={300}
          {...field("addressLine")}
        />
        <Input label="City" required maxLength={100} {...field("city")} />
        <Input
          label="Postal code"
          required
          maxLength={12}
          {...field("postalCode")}
        />
        {india && (
          <>
            <Select label="State (GST)" required {...field("stateCode")}>
              <option value="" disabled>
                Choose a state
              </option>
              {GST_STATES.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.code} · {st.name}
                </option>
              ))}
            </Select>
            <Input label="GSTIN" helperText="Optional. 15 characters, starting with your state code, for GST input credit." maxLength={15} {...field("gstin")} />
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {note}
        <Button type="submit" pending={pending}>
          Save billing details
        </Button>
      </div>
    </form>
  );
}
