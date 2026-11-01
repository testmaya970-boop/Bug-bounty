"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/form";
import { issueInvoiceNoteAction, setTaxResidenceAction, type ActionResult } from "../../actions/documents";

function Result({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={`basis-full text-[13px] font-medium ${result.ok ? "text-success" : "text-danger"}`}>
      {result.ok ? result.message : result.message}
    </p>
  );
}

/** India and the US have their own withholding and certificates; anything else withholds nothing. */
export function TaxResidenceForm({ current, countries }: { current: string | null; countries: { code: string; name: string }[] }) {
  const router = useRouter();
  const [country, setCountry] = useState(current ?? "");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          setResult(await setTaxResidenceAction({ country }));
          router.refresh();
        });
      }}
    >
      <Select label="Tax residence" value={country} onChange={(event) => setCountry(event.target.value)} className="min-w-56">
        <option value="">Not set</option>
        <option value="IN">India</option>
        <option value="US">United States</option>
        <option disabled>──────────</option>
        {countries.filter((c) => c.code !== "IN" && c.code !== "US").map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" pending={pending}>
        Save
      </Button>
      <Result result={result} />
    </form>
  );
}

export function IssueInvoiceNote({ invoices }: { invoices: { id: string; label: string }[] }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  if (!invoices.length) return <p className="text-[13px] text-ink-muted">No invoices issued yet, so there is nothing to correct.</p>;
  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const r = await issueInvoiceNoteAction({
            invoiceId: String(form.get("invoiceId")),
            kind: form.get("kind") === "debit" ? "debit" : "credit",
            amount: String(form.get("amount")),
            reason: String(form.get("reason")),
          });
          setResult(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <Select label="Invoice" name="invoiceId" required>
        {invoices.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </Select>
      <Select label="Note" name="kind" defaultValue="credit">
        <option value="credit">Credit note (bills less)</option>
        <option value="debit">Debit note (bills more)</option>
      </Select>
      <Input label="Taxable amount" name="amount" inputMode="decimal" placeholder="500.00" required helperText="GST is added on the invoice's own split." />
      <Input label="Reason" name="reason" required minLength={5} maxLength={500} placeholder="Refund for a cancelled award" />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" pending={pending}>
          Issue note
        </Button>
        <Result result={result} />
      </div>
    </form>
  );
}
