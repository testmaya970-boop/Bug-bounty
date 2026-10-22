"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Select } from "../ui/form";
import { SeverityBadge } from "../ui/badge";
import { CVSS4_METRICS, buildCvss4Vector, cvss4Band, cvss4Score, parseCvss4Vector, type Cvss4Metrics } from "../../lib/cvss4";
import { setReportCvss4Action } from "../../actions/reports";

/** CVSS 4.0 base vector for a report (202610220006): pick the 11 base metrics, see the score
 * live, save. The server recomputes the score; the browser's is a preview. Read-only once
 * locked (final decision or finalized bounty). */
export function Cvss4Editor({ organizationId, programId, reportId, vector, score, locked }: { organizationId: string; programId: string; reportId: string; vector: string | null; score: number | null; locked: boolean }) {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Partial<Cvss4Metrics>>(parseCvss4Vector(vector));
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const built = buildCvss4Vector(metrics);
  const preview = useMemo(() => (built ? cvss4Score(built) : null), [built]);

  if (locked || !open) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">CVSS 4.0</p>
        {vector && score !== null ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <span className="font-mono font-semibold tabular-nums">{score.toFixed(1)}</span>
            <SeverityBadge severity={cvss4Band(score)} />
            <span className="break-all font-mono text-xs text-ink-muted">{vector}</span>
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Not scored with CVSS 4.0.</p>
        )}
        {!locked && (
          <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-action underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus">
            {vector ? "Change CVSS 4.0 vector" : "Score with CVSS 4.0"}
          </button>
        )}
      </div>
    );
  }

  function save() {
    if (!built) return;
    setMessage(null);
    startTransition(async () => {
      const result = await setReportCvss4Action({ organizationId, programId, reportId, vector: built });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium text-ink">CVSS 4.0 base metrics</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CVSS4_METRICS.map((metric) => (
          <Select key={metric.key} label={metric.label} value={metrics[metric.key] ?? ""} onChange={(event) => setMetrics((m) => ({ ...m, [metric.key]: event.target.value }))}>
            <option value="">Choose…</option>
            {metric.values.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink" aria-live="polite">
          {preview !== null ? (
            <>
              Score <span className="font-mono font-semibold tabular-nums">{preview.toFixed(1)}</span> <SeverityBadge severity={cvss4Band(preview)} />
            </>
          ) : (
            <span className="text-ink-muted">Choose every metric to see the score.</span>
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="quiet" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button pending={pending} disabled={!built} onClick={save}>
            Save CVSS 4.0
          </Button>
        </div>
      </div>
      {message && (
        <p role="alert" className="text-sm font-medium text-danger">
          {message.text}
        </p>
      )}
    </fieldset>
  );
}
