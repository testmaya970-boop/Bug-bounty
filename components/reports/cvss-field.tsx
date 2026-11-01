"use client";

import React, { useState } from "react";
import { Input, Select } from "../ui/form";
import { CVSS4_METRICS, buildCvss4Vector, parseCvss4Vector, type Cvss4Metrics } from "../../lib/cvss4";
import { scoreCvssVector } from "../../lib/cvss-vector";
import { severityLabel } from "../../lib/report-status";

/**
 * The researcher's optional CVSS score in the report composer. Build a CVSS 4.0 vector metric
 * by metric (the default), or paste a vector (4.0, or 3.1 for programs that still use it). The
 * score shown is a live preview; the server re-scores the vector on submit and never takes a
 * score from the browser. This is the researcher's assessment only: the organization confirms
 * severity and sets priority separately during triage.
 */
export function CvssField({ value, onChange, error }: { value: string; onChange: (vector: string) => void; error?: string }) {
  const [mode, setMode] = useState<"build" | "paste">(() => (value && !value.startsWith("CVSS:4.0/") ? "paste" : "build"));
  const [metrics, setMetrics] = useState<Partial<Cvss4Metrics>>(() => parseCvss4Vector(value));
  const [pasted, setPasted] = useState(value);
  const scored = value ? scoreCvssVector(value) : null;
  const complete = CVSS4_METRICS.filter((m) => metrics[m.key]).length;

  function setMetric(key: string, next: string) {
    const updated = { ...metrics, [key]: next };
    setMetrics(updated);
    onChange(buildCvss4Vector(updated) ?? "");
  }

  function switchMode(next: "build" | "paste") {
    setMode(next);
    if (next === "paste") setPasted(value);
    else onChange(buildCvss4Vector(metrics) ?? "");
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-ink">CVSS score</legend>
      <p className="text-xs text-ink-muted">Optional. Your own assessment, scored with CVSS 4.0 by default. The organization confirms the final severity.</p>
      <div role="radiogroup" aria-label="How to enter CVSS" className="inline-flex rounded-md border border-border p-0.5">
        {(["build", "paste"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mode === option}
            onClick={() => switchMode(option)}
            className={`min-h-9 rounded px-3 text-xs font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none ${mode === option ? "bg-surface-muted text-ink" : "text-ink-muted hover:text-ink"}`}
          >
            {option === "build" ? "Build a 4.0 vector" : "Paste a vector"}
          </button>
        ))}
      </div>

      {mode === "build" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CVSS4_METRICS.map((metric) => (
            <Select key={metric.key} label={metric.label} value={metrics[metric.key] ?? ""} onChange={(event) => setMetric(metric.key, event.target.value)}>
              <option value="">Choose…</option>
              {metric.values.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          ))}
        </div>
      ) : (
        <Input
          label="CVSS vector"
          value={pasted}
          onChange={(event) => {
            setPasted(event.target.value);
            onChange(event.target.value.trim());
          }}
          className="[&_input]:font-mono"
          maxLength={200}
          spellCheck={false}
          autoComplete="off"
          helperText="CVSS:4.0/AV:N/AC:L/... or CVSS:3.1/AV:N/AC:L/..., base metrics only."
          error={error ?? (value && scored && !scored.ok ? scored.message : undefined)}
        />
      )}

      <p className="text-sm" aria-live="polite">
        {scored?.ok ? (
          <>
            <span className="font-mono font-semibold tabular-nums text-ink">{scored.score.toFixed(1)}</span>{" "}
            <span className="font-medium text-ink">{severityLabel(scored.severity)}</span> <span className="text-ink-muted">(CVSS {scored.version})</span>
            <span className="mt-0.5 block break-all font-mono text-xs text-ink-muted">{scored.vector}</span>
          </>
        ) : mode === "build" ? (
          <span className="text-ink-muted">{complete === 0 ? "Not scored." : `Choose all ${CVSS4_METRICS.length} metrics to see the score (${complete} chosen).`}</span>
        ) : null}
      </p>
      {mode === "build" && error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
