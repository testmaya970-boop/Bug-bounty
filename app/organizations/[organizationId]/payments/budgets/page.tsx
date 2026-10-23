import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { AppShell } from "../../../../../components/app-shell";
import { billingGate } from "../../../../../components/documents/billing-gate";
import { ProgramBudgetsList } from "../../../../../components/organizations/billing-settings";
import { getOrganizationBalances, listProgramBudgets, type ProgramBudget } from "../../../../../services/billing";
import { money } from "../../../../../components/documents/document-sheet";
import { cn } from "../../../../../lib/cn";

type Filter = "all" | "capped" | "near" | "uncapped";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All programs" },
  { key: "capped", label: "With a budget" },
  { key: "near", label: "80% used or more" },
  { key: "uncapped", label: "No budget" },
];
const usedShare = (b: ProgramBudget) => (b.capMinorUnits ? (b.usedMinorUnits ?? 0) / b.capMinorUnits : 0);

/**
 * Budgets: what each program may award, what it has used and what is left, searchable by
 * program name and filterable by how close it is to its cap. Edit a cap inline (the same
 * control as Payments). Totals are per currency, never blended.
 */
export default async function BudgetsPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ q?: string; filter?: string }> }) {
  const { organizationId } = await params;
  const { q = "", filter: rawFilter } = await searchParams;
  const base = `/organizations/${organizationId}/payments`;
  const gate = await billingGate(organizationId, `${base}/budgets`, "Budgets");
  if (gate.denied) return gate.denied;
  const filter: Filter = FILTERS.some((f) => f.key === rawFilter) ? (rawFilter as Filter) : "all";

  const [budgets, balances] = await Promise.all([listProgramBudgets(organizationId), getOrganizationBalances(organizationId)]);
  const term = q.trim().toLowerCase();
  const shown = budgets
    .filter((b) => !term || b.programName.toLowerCase().includes(term))
    .filter((b) => (filter === "capped" ? b.capMinorUnits !== null : filter === "uncapped" ? b.capMinorUnits === null : filter === "near" ? usedShare(b) >= 0.8 : true))
    .sort((a, b) => usedShare(b) - usedShare(a) || a.programName.localeCompare(b.programName));

  const totals = new Map<string, { cap: number; used: number; programs: number }>();
  for (const b of budgets.filter((x) => x.capMinorUnits !== null && x.currency)) {
    const t = totals.get(b.currency!) ?? { cap: 0, used: 0, programs: 0 };
    totals.set(b.currency!, { cap: t.cap + b.capMinorUnits!, used: t.used + (b.usedMinorUnits ?? 0), programs: t.programs + 1 });
  }
  const near = budgets.filter((b) => usedShare(b) >= 0.8).length;
  const href = (next: Partial<{ q: string; filter: Filter }>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(filter !== "all" && { filter }), ...next });
    if (p.get("filter") === "all") p.delete("filter");
    return `${base}/budgets${p.toString() ? `?${p}` : ""}` as Route;
  };

  return (
    <AppShell title="Budgets" user={gate.user} organizationId={organizationId}>
      <div className="max-w-5xl space-y-5">
        <div className="grid grid-cols-1 divide-y divide-border rounded-xl border border-border bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-5">
            <p className="text-[13px] font-medium text-ink-muted">Budgeted</p>
            {totals.size === 0 ? <p className="mt-1.5 text-2xl font-semibold text-ink-muted">None set</p> : [...totals].map(([c, t]) => <p key={c} className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-ink">{money(t.cap, c)}</p>)}
            <p className="mt-1 text-xs text-ink-muted">{budgets.filter((b) => b.capMinorUnits !== null).length} of {budgets.length} programs capped</p>
          </div>
          <div className="p-5">
            <p className="text-[13px] font-medium text-ink-muted">Left to award</p>
            {totals.size === 0 ? <p className="mt-1.5 text-2xl font-semibold text-ink-muted">No limit</p> : [...totals].map(([c, t]) => <p key={c} className={cn("mt-1.5 text-2xl font-semibold tracking-tight tabular-nums", t.cap - t.used < 0 ? "text-danger" : "text-ink")}>{money(t.cap - t.used, c)}</p>)}
            <p className="mt-1 text-xs text-ink-muted">Across capped programs</p>
          </div>
          <div className="p-5">
            <p className="text-[13px] font-medium text-ink-muted">Balance available</p>
            {balances.length === 0 ? <p className="mt-1.5 text-2xl font-semibold text-ink-muted">0.00</p> : balances.map((b) => <p key={b.currency} className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-ink">{money(b.available, b.currency)}</p>)}
            <p className={cn("mt-1 text-xs", near > 0 ? "font-medium text-warning" : "text-ink-muted")}>{near > 0 ? `${near} program${near === 1 ? "" : "s"} at 80% or more of budget` : "No program near its cap"}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form action={`${base}/budgets`} className="relative min-w-0 flex-1 sm:max-w-sm">
            {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
            <MagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input type="search" name="q" defaultValue={q} placeholder="Search programs" aria-label="Search programs" className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-ink-muted focus-visible:border-focus" />
          </form>
          <nav aria-label="Budget filters" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Link key={f.key} prefetch={false} href={href({ filter: f.key })} aria-current={filter === f.key ? "true" : undefined} className={cn("rounded-md px-2.5 py-1 text-[13px]", filter === f.key ? "bg-surface-muted font-medium text-ink" : "text-ink-muted hover:text-ink")}>
                {f.label}
              </Link>
            ))}
          </nav>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-[13px] text-ink-muted">{budgets.length === 0 ? "No programs yet. Budgets appear once you create an engagement." : "No program matches. Clear the search or pick another filter."}</p>
        ) : (
          <ProgramBudgetsList organizationId={organizationId} budgets={shown} />
        )}
      </div>
    </AppShell>
  );
}
