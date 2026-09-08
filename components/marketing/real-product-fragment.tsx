import React from "react";
import { SeverityBadge, StatusBadge } from "../ui/badge";

const ROWS: { title: string; target: string; status: "new" | "triaging" | "needs_information" | "accepted"; severity: "critical" | "high" | "medium" }[] = [
  { title: "Authentication bypass on session refresh", target: "api.cloudvault.example/v1/session", status: "accepted", severity: "critical" },
  { title: "Stored XSS in report comment field", target: "app.cloudvault.example/reports", status: "triaging", severity: "high" },
  { title: "Rate limit missing on password reset", target: "api.cloudvault.example/v1/auth", status: "needs_information", severity: "medium" },
];

/**
 * A cropped fragment of the actual organization report inbox -- the same header row,
 * column set, and badge components as components/reports/report-inbox-table.tsx, not an
 * invented dashboard. A mono route label stands in for the browser-chrome/device-frame
 * mockup this project has repeatedly ruled out: it identifies the fragment as a real
 * route in Sentinel's own information architecture without a fake window frame around it.
 * The bottom edge fades out (not a hard cut) to read honestly as "more exists above and
 * below this," never as the whole interface.
 */
export function RealProductFragment() {
  return (
    <div aria-hidden="true" className="w-full max-w-2xl overflow-hidden rounded-lg border-2 border-ink bg-surface shadow-[0_32px_80px_-24px_rgba(0,0,0,0.55)]">
      <div className="flex items-center justify-between gap-3 bg-ink px-5 py-3 sm:px-6">
        <span className="min-w-0 break-all font-mono text-[11px] text-canvas/70">unpatched.app/organizations/cloudvault/programs/api-security/reports</span>
        <span className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wider text-canvas/45">Illustrative fragment</span>
      </div>
      <div className="relative">
        {/* Desktop/tablet: a real table — matches components/reports/report-inbox-table.tsx
            exactly (same columns, same hidden-below-sm Target column). */}
        <table className="hidden w-full border-collapse text-left text-sm sm:table">
          <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              {["Severity", "Report", "Target", "Status"].map((header) => (
                <th key={header} scope="col" className="px-4 py-2.5 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.title} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <SeverityBadge severity={row.severity} />
                </td>
                <td className="px-4 py-3 font-medium text-ink">{row.title}</td>
                <td className="px-4 py-3">
                  <span className="break-all font-mono text-xs text-ink-muted">{row.target}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile: labelled cards, never a shrunk/scrolled table — the same
            responsive split report-inbox-table.tsx already establishes for the real
            product, reproduced here rather than inventing a second mobile pattern. */}
        <ul className="divide-y divide-border sm:hidden">
          {ROWS.map((row) => (
            <li key={row.title} className="p-4">
              <p className="font-medium text-ink">{row.title}</p>
              <div className="mt-2 flex items-center gap-3">
                <SeverityBadge severity={row.severity} />
                <StatusBadge status={row.status} />
              </div>
            </li>
          ))}
        </ul>

        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />
      </div>
    </div>
  );
}
