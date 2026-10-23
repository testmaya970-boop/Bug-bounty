import React from "react";
import type { AssetInventoryItem } from "../../types/scope";

// Security posture over the asset inventory (Oct 22, Wiz-style): every asset placed in one
// exposure bucket from its real findings, shown as a single stacked bar, the headline numbers,
// and the assets that need attention first. Tier 1 = crown jewels (asset tiers, 202610220006).

type Bucket = "critical" | "exposed" | "remediated" | "untested";
const BUCKETS: { key: Bucket; label: string; hint: string; bar: string; text: string }[] = [
  { key: "critical", label: "High exposure", hint: "3+ open findings", bar: "bg-severity-critical", text: "text-severity-critical" },
  { key: "exposed", label: "Exposed", hint: "1-2 open findings", bar: "bg-severity-high", text: "text-severity-high" },
  { key: "remediated", label: "Remediated", hint: "findings, none open", bar: "bg-success", text: "text-success" },
  { key: "untested", label: "Untested", hint: "no findings yet", bar: "bg-border-strong", text: "text-ink-muted" },
];

function bucketOf(a: AssetInventoryItem): Bucket {
  if (a.openReports >= 3) return "critical";
  if (a.openReports > 0) return "exposed";
  return a.totalReports > 0 ? "remediated" : "untested";
}

export function AssetPosture({ assets, tiers, more }: { assets: AssetInventoryItem[]; tiers: Record<string, number>; more: boolean }) {
  if (assets.length === 0) return null;
  const counts = Object.fromEntries(BUCKETS.map((b) => [b.key, 0])) as Record<Bucket, number>;
  for (const a of assets) counts[bucketOf(a)] += 1;
  const open = assets.reduce((s, a) => s + a.openReports, 0);
  const crownExposed = assets.filter((a) => (tiers[a.id] ?? 1) === 1 && a.openReports > 0).length;
  const tested = assets.length - counts.untested;
  const top = [...assets].filter((a) => a.openReports > 0).sort((x, y) => y.openReports - x.openReports || (tiers[x.id] ?? 1) - (tiers[y.id] ?? 1)).slice(0, 5);

  return (
    <section aria-label="Security posture" className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-2 divide-border border-b border-border sm:grid-cols-4 sm:divide-x">
        {[
          ["Assets", String(assets.length), more ? "first page shown" : "in scope or retired"],
          ["Open findings", String(open), `${counts.critical + counts.exposed} assets affected`],
          ["Tier 1 exposed", String(crownExposed), "crown-jewel assets with open findings"],
          ["Test coverage", `${Math.round((tested / assets.length) * 100)}%`, `${tested} of ${assets.length} assets reported on`],
        ].map(([label, value, sub]) => (
          <div key={label} className="p-4">
            <p className="text-xs font-medium text-ink-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
            <p className="text-xs text-ink-muted">{sub}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-[13px] font-semibold text-ink">Exposure</p>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={BUCKETS.map((b) => `${b.label} ${counts[b.key]}`).join(", ")}>
            {BUCKETS.map((b) => counts[b.key] > 0 && <span key={b.key} className={b.bar} style={{ width: `${(counts[b.key] / assets.length) * 100}%` }} />)}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
            {BUCKETS.map((b) => (
              <li key={b.key} className="flex items-center gap-2">
                <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${b.bar}`} />
                <span className="text-ink">{b.label}</span>
                <span className={`ml-auto font-semibold tabular-nums ${b.text}`}>{counts[b.key]}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-ink">Fix first</p>
          {top.length === 0 ? (
            <p className="mt-3 text-[13px] text-ink-muted">No asset has an open finding.</p>
          ) : (
            <ol className="mt-2 divide-y divide-border">
              {top.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2 text-[13px]">
                  <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-semibold ${a.openReports >= 3 ? "bg-severity-critical/10 text-severity-critical" : "bg-severity-high/10 text-severity-high"}`}>{a.openReports}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{a.displayIdentifier}</span>
                  <span className="shrink-0 text-xs text-ink-muted">Tier {tiers[a.id] ?? 1}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
