import React from "react";

// The redesigned pages' summary panel: what this page is for, real status badges, the page's
// actions, and a row of metric tiles. Sits under the page's own h1 (OrganizationHeader), so it
// never repeats the title. Every value passed in must come from real data.

export type SummaryBadge = { label: string; tone: "success" | "info" | "warning" | "neutral" };
export type SummaryMetric = { label: string; value: string; detail?: string; tone?: "success" | "warning" | "danger" | "neutral" };

const BADGE: Record<SummaryBadge["tone"], string> = {
  success: "border-[#A6F4C5] bg-[#ECFDF3] text-[#027A48]",
  info: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
  warning: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  neutral: "border-border bg-surface-muted text-ink-muted",
};
const DETAIL: Record<NonNullable<SummaryMetric["tone"]>, string> = {
  success: "text-[#027A48]",
  warning: "text-[#B54708]",
  danger: "text-[#B42318]",
  neutral: "text-ink-muted",
};

export function PageSummary({ description, badges = [], actions, metrics = [] }: { description?: React.ReactNode; badges?: SummaryBadge[]; actions?: React.ReactNode; metrics?: SummaryMetric[] }) {
  return (
    <section aria-label="Summary" className="rounded-2xl border border-border bg-gradient-to-b from-surface to-surface-muted p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          {badges.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <li key={b.label} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE[b.tone]}`}>{b.label}</li>
              ))}
            </ul>
          )}
          {description && <p className="max-w-2xl text-sm text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {metrics.length > 0 && (
        <dl className="mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="min-w-0 rounded-xl border border-border bg-surface p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
              <dt className="text-[12px] font-medium text-ink-muted">{m.label}</dt>
              <dd className="mt-1 font-mono text-xl font-bold tabular-nums text-ink">{m.value}</dd>
              {m.detail && <dd className={`mt-1.5 truncate text-[11px] font-medium ${DETAIL[m.tone ?? "neutral"]}`}>{m.detail}</dd>}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
