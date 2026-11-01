import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { PrintButton } from "../organizations/print-button";
import { CsvButton } from "./csv-button";
import { cn } from "../../lib/cn";

// The one printable document layout (Stripe-style receipt/statement sheet) behind every
// billing and earnings document: brand and title, the document's number and dates, the two
// parties, then the body. Printing prints only the sheet (.print-only-this, app/globals.css).

export { formatDocumentMoney as money } from "../../lib/money";

export function DocumentToolbar({ back, csv }: { back: { href: string; label: string }; csv?: React.ComponentProps<typeof CsvButton> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href={back.href as Route} prefetch={false} className="text-[13px] text-ink-muted hover:text-ink">
        ← {back.label}
      </Link>
      <div className="flex gap-2">
        {csv && <CsvButton {...csv} />}
        <PrintButton label="Download PDF" />
      </div>
    </div>
  );
}

export type Party = { title: string; name: string; lines: (string | null | undefined)[] };

export function DocumentSheet({
  title,
  number,
  meta,
  parties,
  sandbox,
  children,
  footnotes = [],
}: {
  title: string;
  number?: string;
  meta: [string, string][];
  parties: Party[];
  sandbox?: boolean;
  children: React.ReactNode;
  footnotes?: string[];
}) {
  return (
    <article className="print-only-this relative overflow-hidden rounded-xl border border-border bg-surface text-[13px] shadow-[0_1px_2px_rgba(16,17,20,0.04)]">
      {sandbox && (
        <p className="border-b border-warning/30 bg-warning/10 px-6 py-2 text-xs font-medium text-warning sm:px-10">
          Sandbox document: generated from test data with no configured legal entity. Not valid for tax or accounting.
        </p>
      )}
      <div className="space-y-8 p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <span aria-hidden="true" className="inline-flex size-6 items-center justify-center rounded-md bg-action text-on-action">
                <ShieldCheck weight="fill" className="size-3.5" />
              </span>
              Unpatched
            </p>
            <h2 className="mt-6 text-2xl font-semibold tracking-tight text-ink">{title}</h2>
            {number && <p className="mt-1 font-mono text-xs text-ink-muted">{number}</p>}
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1.5 text-right">
            {meta.map(([label, value]) => (
              <React.Fragment key={label}>
                <dt className="text-ink-muted">{label}</dt>
                <dd className="font-medium text-ink tabular-nums">{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </header>
        {parties.length > 0 && (
          <div className={cn("grid grid-cols-1 gap-6", parties.length > 1 && "sm:grid-cols-2")}>
            {parties.map((p) => (
              <div key={p.title} className="min-w-0">
                <p className="text-xs font-medium text-ink-muted">{p.title}</p>
                <p className="mt-1 font-semibold text-ink">{p.name}</p>
                {p.lines.filter(Boolean).map((line) => (
                  <p key={line} className="text-ink-muted">
                    {line}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
        {children}
        {footnotes.length > 0 && (
          <footer className="space-y-1 border-t border-border pt-4 text-xs text-ink-muted">
            {footnotes.map((f) => (
              <p key={f}>{f}</p>
            ))}
          </footer>
        )}
      </div>
    </article>
  );
}

/** The headline figure of a receipt or statement, Stripe-style: a big amount and what it is. */
export function DocumentAmount({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-ink-muted">{sub}</p>}
    </div>
  );
}

export type DocColumn = { header: string; align?: "right"; mono?: boolean };
export function DocumentTable({ columns, rows, empty }: { columns: DocColumn[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-ink-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left">
        <thead className="border-b border-border text-xs text-ink-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className={cn("py-2 pr-3 font-medium last:pr-0", c.align === "right" && "text-right")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={cn("py-2.5 pr-3 align-top text-ink last:pr-0", columns[j]?.align === "right" && "whitespace-nowrap text-right tabular-nums", columns[j]?.mono && "whitespace-nowrap font-mono text-xs")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Right-aligned totals block; the last row is the bold total. */
export function DocumentTotals({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-8 gap-y-1.5">
      {rows.map(([label, value], i) => (
        <React.Fragment key={label}>
          <dt className={cn("text-ink-muted", i === rows.length - 1 && "border-t border-border pt-2 font-semibold text-ink")}>{label}</dt>
          <dd className={cn("text-right tabular-nums text-ink", i === rows.length - 1 && "border-t border-border pt-2 font-semibold")}>{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
