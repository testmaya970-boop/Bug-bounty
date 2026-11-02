import React from "react";
import { CheckCircle2, Clock, Cpu, FileCode2, ShieldAlert, ShieldCheck } from "lucide-react";
import { getFindingTechnicalFacts } from "../../lib/findings-metrics";
import { formatMoney } from "../../lib/money";
import type { Report } from "../../types/report";
import type { ReportSla, SlaTarget } from "../../types/program-policy";
import type { ReportBountyDecision } from "../../types/bounty";

const CARD = "min-w-0 rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-[#667085]";

/** The report's own facts, as five cards: CVSS, weakness, affected target, SLA, researcher and bounty. */
export function FindingTechnicalTelemetryStrip({ report, sla, bountyDecision }: { report: Report; sla: ReportSla | null; bountyDecision: ReportBountyDecision | null }) {
  const facts = getFindingTechnicalFacts(report);
  // The SLA stage still running (or the last one), and whether it's met, at risk or breached.
  const stages: [string, SlaTarget | null][] = [["First response", sla?.firstResponse ?? null], ["Triage", sla?.triage ?? null], ["Resolution", sla?.resolution ?? null]];
  const active = stages.find(([, t]) => t && !t.metAt) ?? stages.filter(([, t]) => t).pop();
  const target = active?.[1] ?? null;
  const tone = !target ? "neutral" : target.breached ? "danger" : target.metAt ? "success" : "warning";
  const slaLabel = !target ? "No SLA on this program" : target.breached ? `${active![0]} breached` : target.metAt ? `${active![0]} met` : `${active![0]} due`;
  const bounty =
    bountyDecision?.state === "finalized" && bountyDecision.finalAmountMinorUnits !== null && bountyDecision.currency
      ? formatMoney(bountyDecision.finalAmountMinorUnits, bountyDecision.currency)
      : bountyDecision?.calculatedMaxAmountMinorUnits && bountyDecision.currency
        ? `Up to ${formatMoney(bountyDecision.calculatedMaxAmountMinorUnits, bountyDecision.currency)}`
        : null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className={CARD}>
        <div className="flex items-center justify-between">
          <span className={LABEL}>{facts.cvssVersion ? `CVSS v${facts.cvssVersion}` : "CVSS"}</span>
          <ShieldAlert className="size-4 text-[#EF4444]" />
        </div>
        <div className="mt-2 font-mono text-[26px] font-bold text-[#111827] tabular-nums">{facts.cvssScore !== null ? facts.cvssScore.toFixed(1) : "-"}</div>
        <p className="mt-1 truncate font-mono text-[11px] text-[#667085]" title={facts.cvssVector ?? undefined}>
          {facts.cvssVector ?? (facts.cvssScore === null ? "Not scored yet" : "CVSS 3.1 base score")}
        </p>
      </div>

      <div className={CARD}>
        <div className="flex items-center justify-between">
          <span className={LABEL}>Weakness</span>
          <FileCode2 className="size-4 text-[#2563EB]" />
        </div>
        <p className="mt-2 line-clamp-2 text-[14px] font-semibold text-[#111827]">{facts.weakness ?? "Not classified yet"}</p>
      </div>

      <div className={CARD}>
        <div className="flex items-center justify-between">
          <span className={LABEL}>Affected target</span>
          <Cpu className="size-4 text-[#667085]" />
        </div>
        <div className="mt-2 truncate font-mono text-[14px] font-bold text-[#111827]" title={facts.affectedComponent}>
          {facts.affectedComponent}
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[#12B76A]">
          <CheckCircle2 className="size-3.5" />
          <span className="truncate font-medium text-[#475467]">{facts.environment}</span>
        </p>
      </div>

      <div className={CARD}>
        <div className="flex items-center justify-between">
          <span className={LABEL}>SLA status</span>
          <Clock className="size-4 text-[#F59E0B]" />
        </div>
        <span
          className={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            tone === "danger" ? "bg-[#FEF3F2] text-[#B91C1C]" : tone === "warning" ? "bg-[#FFFAEB] text-[#B45309]" : tone === "success" ? "bg-[#ECFDF3] text-[#027A48]" : "bg-[#F2F4F7] text-[#344054]"
          }`}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-current" />
          <span className="truncate">{slaLabel}</span>
        </span>
        {sla && <p className="mt-1.5 text-[12px] text-[#667085]">Policy v{sla.policyVersionNumber}</p>}
      </div>

      <div className={CARD}>
        <div className="flex items-center justify-between">
          <span className={LABEL}>Researcher</span>
          <ShieldCheck className="size-4 text-[#12B76A]" />
        </div>
        <p className="mt-2 truncate text-[14px] font-semibold text-[#111827]">{report.researcherName}</p>
        <p className="mt-1 truncate text-[12px] text-[#667085]">
          {report.researcherUsername ? `@${report.researcherUsername}` : ""}
          {bounty && <span className="ml-1 rounded-full bg-[#ECFDF3] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#12B76A]">{bounty}</span>}
        </p>
      </div>
    </div>
  );
}
