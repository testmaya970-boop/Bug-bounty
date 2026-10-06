import React from "react";
import { ToneBadge } from "../ui/badge";
import { LocalTime } from "../ui/local-time";
import type { ProgramPolicy, ReportSla, SlaTarget } from "../../types/program-policy";

const DISCLOSURE_LABEL = {
  coordinated: (days: number | null) => `Coordinated disclosure${days !== null ? ` · ${days} days after resolution` : ""}`,
  full: () => "Full disclosure permitted",
  none: () => "No public disclosure",
} as const;

function formatHours(hours: number): string {
  return hours % 24 === 0 && hours >= 48 ? `${hours / 24} days` : `${hours} hours`;
}

/** The program's published rules, read before researching and before submitting. No hooks,
 * so server pages and the client report form both render it. */
export function ProgramPolicySummary({ policy, showRules = true }: { policy: ProgramPolicy | null; showRules?: boolean }) {
  if (!policy) {
    return <p className="text-sm text-ink-muted">This program hasn&apos;t published a policy yet. The platform&apos;s standard terms apply.</p>;
  }
  const targets = [
    policy.firstResponseTargetHours !== null && `First response within ${formatHours(policy.firstResponseTargetHours)}`,
    policy.triageTargetHours !== null && `Triage within ${formatHours(policy.triageTargetHours)}`,
    policy.resolutionTargetDays !== null && `Resolution within ${policy.resolutionTargetDays} days`,
  ].filter((t): t is string => Boolean(t));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {policy.safeHarbor ? (
          <a href="/safe-harbor" className="focus-visible:outline-2 focus-visible:outline-focus">
            <ToneBadge tone={{ text: "text-success", bg: "bg-success" }}>Safe harbor</ToneBadge>
          </a>
        ) : (
          <ToneBadge tone={{ text: "text-warning", bg: "bg-warning" }}>No safe harbor commitment</ToneBadge>
        )}
        <ToneBadge tone={{ text: "text-info", bg: "bg-info" }}>{DISCLOSURE_LABEL[policy.disclosureMode](policy.disclosureDays)}</ToneBadge>
        <span className="font-mono text-xs text-ink-muted">
          Policy v{policy.versionNumber} · published <LocalTime value={policy.publishedAt} dateOnly />
        </span>
      </div>
      {targets.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
          {targets.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {showRules && <p className="whitespace-pre-wrap text-sm text-ink-muted">{policy.rulesOfEngagement}</p>}
    </div>
  );
}

function SlaRow({ label, target }: { label: string; target: SlaTarget | null }) {
  if (!target) return null;
  const state = target.metAt ? (target.breached ? "Met late" : "Met") : target.breached ? "Overdue" : "Due";
  const tone = target.breached ? { text: "text-danger", bg: "bg-danger" } : target.metAt ? { text: "text-success", bg: "bg-success" } : { text: "text-info", bg: "bg-info" };
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="text-sm text-ink">{label}</span>
      <span className="flex items-center gap-2 text-xs text-ink-muted">
        <ToneBadge tone={tone}>{state}</ToneBadge>
        {target.metAt ? <LocalTime value={target.metAt} /> : <>by <LocalTime value={target.dueAt} /></>}
      </span>
    </li>
  );
}

/** A report's response targets from the policy it was submitted under. */
export function ReportSlaPanel({ sla }: { sla: ReportSla }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">Targets from program policy v{sla.policyVersionNumber}</p>
      <ul className="mt-1 divide-y divide-border">
        <SlaRow label="First response" target={sla.firstResponse} />
        <SlaRow label="Triage" target={sla.triage} />
        <SlaRow label="Resolution" target={sla.resolution} />
      </ul>
    </div>
  );
}
