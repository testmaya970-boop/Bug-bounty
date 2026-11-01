import React from "react";

export type ChartTable = { columns: string[]; rows: (string | number)[][] };

/**
 * The frame every dashboard chart sits in: title, one-line subtitle (what is plotted, over
 * what window), the chart, and its table twin behind "View as table" -- so no value is
 * reachable only by hovering, and the lighter palette slots always have a text equivalent.
 */
export function ChartCard({
  title,
  subtitle,
  table,
  empty,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  table?: ChartTable;
  /** Shown instead of the chart when there is nothing to plot yet. */
  empty?: string | false;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className={`flex min-w-0 flex-col rounded-lg border border-border bg-surface p-5 ${className ?? ""}`}>
      <figcaption className="mb-4">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
      </figcaption>
      {empty ? <p className="flex min-h-32 flex-1 items-center justify-center rounded-md bg-surface-muted px-4 text-center text-sm text-ink-muted">{empty}</p> : children}
      {table && !empty && table.rows.length > 0 && (
        <details className="mt-4 border-t border-border pt-3 text-sm">
          <summary className="cursor-pointer select-none text-xs font-medium text-ink-muted hover:text-ink">View as table</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-ink-muted">
                  {table.columns.map((c) => (
                    <th key={c} scope="col" className="py-1.5 pr-4 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className={`py-1.5 pr-4 ${j === 0 ? "text-ink" : "text-ink-muted"}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}
