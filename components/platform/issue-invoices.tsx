"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { issueInvoicesAction } from "../../actions/billing";

/** Issues every outstanding fee invoice for one finished month. Safe to run twice: awards
 * already invoiced are skipped. */
export function IssueInvoices({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setMessage(null);
          const result = await issueInvoicesAction({ month });
          if (!result.ok)
            return setMessage({ ok: false, text: result.message });
          setMessage({
            ok: true,
            text:
              result.issued === 0
                ? "Nothing to invoice for that month."
                : `Issued ${result.issued} invoice${result.issued === 1 ? "" : "s"}.`,
          });
          router.refresh();
        });
      }}
    >
      <Input
        type="month"
        label="Month"
        value={month}
        max={defaultMonth}
        onChange={(event) => setMonth(event.target.value)}
        required
      />
      <Button type="submit" pending={pending} className="mb-[1px]">
        Issue invoices
      </Button>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`basis-full text-sm font-medium ${message.ok ? "text-success" : "text-danger"}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
