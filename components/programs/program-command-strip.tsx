import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, Award, CheckCircle2, Clock, DollarSign, FileText, Flame, Globe, Lock, ShieldCheck, Users, Zap, type LucideIcon } from "lucide-react";
import type { ProgramSummary } from "../../types/program";
import type { OrganizationProgramBountySpend, OrganizationResolutionPerformance, OrganizationSeverityStatusCount } from "../../types/organization";
import type { OrganizationSlaSummary } from "../../types/program-policy";
import type { ReportStatus } from "../../types/report";
import { REPORT_STATUS_LABELS } from "../../types/report";
import { formatMoney } from "../../lib/money";
import { formatHours } from "../../lib/viz";

// The program's operating picture for staff, computed only from what the page already
// fetched. A metric with no source shows "--" rather than a guess.

const OPEN: ReportStatus[] = ["new", "triaging", "needs_information", "accepted"];
const CLOSED_INVALID: ReportStatus[] = ["duplicate", "informative", "not_applicable", "rejected"];
const PIPELINE: ReportStatus[] = ["new", "triaging", "needs_information", "accepted", "resolved"];

export type ProgramCommandFacts = {
  breakdown: OrganizationSeverityStatusCount[];
  resolution: OrganizationResolutionPerformance | null;
  sla: OrganizationSlaSummary | null;
  spend: OrganizationProgramBountySpend[];
  activeResearchers: number;
  scopeCount: number;
  accessRequests: number;
  pendingInvitations: number;
  hasPolicy: boolean;
  policyVersion: number | null;
};

export function summarizeProgram(facts: ProgramCommandFacts) {
  const byStatus: Partial<Record<ReportStatus, number>> = {};
  let openCritical = 0;
  let openHigh = 0;
  for (const row of facts.breakdown) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + row.count;
    if (OPEN.includes(row.status) && row.severity === "critical") openCritical += row.count;
    if (OPEN.includes(row.status) && row.severity === "high") openHigh += row.count;
  }
  const count = (list: ReportStatus[]) => list.reduce((n, s) => n + (byStatus[s] ?? 0), 0);
  const open = count(OPEN);
  const total = count([...OPEN, "resolved", ...CLOSED_INVALID]);
  const valid = count(["accepted", "resolved"]);
  const evaluated = valid + count(CLOSED_INVALID);
  const slaTracked = facts.sla ? facts.sla.firstResponse.tracked + facts.sla.triage.tracked + facts.sla.resolution.tracked : 0;
  const slaBreached = facts.sla ? facts.sla.firstResponse.breached + facts.sla.triage.breached + facts.sla.resolution.breached : 0;
  return {
    byStatus,
    open,
    total,
    openCritical,
    openHigh,
    acceptancePercent: evaluated > 0 ? Math.round((valid / evaluated) * 100) : null,
    slaBreached,
    slaMetPercent: slaTracked > 0 ? Math.round(((slaTracked - slaBreached) / slaTracked) * 100) : null,
    agingOver30: facts.resolution ? facts.resolution.aging31To60DaysCount + facts.resolution.agingOver60DaysCount : 0,
  };
}

type Attention = { id: string; tone: "critical" | "high" | "medium"; title: string; action: string; href: string };

export function attentionItems(facts: ProgramCommandFacts, base: string, status: ProgramSummary["status"]): Attention[] {
  const s = summarizeProgram(facts);
  const items: Attention[] = [];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (s.openCritical > 0) items.push({ id: "critical", tone: "critical", title: `${plural(s.openCritical, "critical report")} still open`, action: "Open inbox", href: `${base}/inbox` });
  if (s.slaBreached > 0) items.push({ id: "sla", tone: "high", title: `${plural(s.slaBreached, "SLA target")} missed`, action: "View reports", href: `${base}/reports` });
  if ((s.byStatus.new ?? 0) > 0) items.push({ id: "new", tone: "high", title: `${plural(s.byStatus.new ?? 0, "new report")} waiting for triage`, action: "Triage", href: `${base}/inbox` });
  if ((s.byStatus.needs_information ?? 0) > 0) items.push({ id: "info", tone: "medium", title: `${plural(s.byStatus.needs_information ?? 0, "report")} waiting on the researcher`, action: "View", href: `${base}/reports?status=needs_information` });
  if (s.agingOver30 > 0) items.push({ id: "aging", tone: "medium", title: `${plural(s.agingOver30, "open report")} older than 30 days`, action: "View reports", href: `${base}/reports` });
  if (facts.accessRequests > 0) items.push({ id: "access", tone: "medium", title: `${plural(facts.accessRequests, "access request")} to review`, action: "Review", href: "#researchers" });
  if (facts.pendingInvitations > 0) items.push({ id: "invites", tone: "medium", title: `${plural(facts.pendingInvitations, "invitation")} not accepted yet`, action: "Manage", href: "#researchers" });
  if (status === "draft" && facts.scopeCount === 0) items.push({ id: "scope", tone: "high", title: "No scope yet: researchers have nothing to test", action: "Add scope", href: "#scope" });
  if (status === "draft" && !facts.hasPolicy) items.push({ id: "policy", tone: "high", title: "No policy published yet", action: "Settings", href: `${base}/settings` });
  return items;
}

const TONE: Record<Attention["tone"], string> = {
  critical: "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]",
  high: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  medium: "border-[#E4E7EC] bg-[#F8FAFC] text-[#344054]",
};

function Kpi({ label, value, detail, icon: Icon, accent }: { label: string; value: string; detail: string; icon: LucideIcon; accent: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[16px] border border-[#E7EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-[#475467]">{label}</span>
        <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg ${accent}`}><Icon className="size-3.5" aria-hidden /></span>
      </div>
      <span className="mt-2.5 font-mono text-2xl font-bold tracking-tight text-[#111827]">{value}</span>
      <span className="mt-2 truncate border-t border-[#F2F4F7] pt-2 text-[11px] font-medium text-[#667085]">{detail}</span>
    </div>
  );
}

export function ProgramCommandStrip({ organizationId, program, facts }: { organizationId: string; program: ProgramSummary; facts: ProgramCommandFacts }) {
  const base = `/organizations/${organizationId}/programs/${program.id}`;
  const s = summarizeProgram(facts);
  const attention = attentionItems(facts, base, program.status);
  const paid = facts.spend.filter((row) => row.payoutCount > 0);
  const payouts = paid.reduce((n, row) => n + row.payoutCount, 0);
  const pipelineMax = Math.max(1, ...PIPELINE.map((st) => s.byStatus[st] ?? 0));
  const closedInvalid = CLOSED_INVALID.reduce((n, st) => n + (s.byStatus[st] ?? 0), 0);

  return (
    <div className="space-y-4 text-[#111827]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-[#E7EAF0] bg-[#F8FAFC] px-2.5 py-0.5 text-xs font-medium text-[#344054]">
          {program.visibility === "public" ? <Globe className="size-3 text-[#2563EB]" aria-hidden /> : <Lock className="size-3 text-[#7C3AED]" aria-hidden />}
          {program.visibility === "public" ? "Public" : "Private"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#E0E7FF] bg-[#EEF2FF] px-2.5 py-0.5 text-xs font-semibold text-[#4338CA]">
          <Award className="size-3" aria-hidden />
          {program.programType === "bounty" ? "Bug bounty" : "Vulnerability disclosure"}
        </span>
        <span className="inline-flex items-center rounded-full border border-[#E7EAF0] bg-white px-2.5 py-0.5 font-mono text-[11px] font-medium text-[#475467]">
          {facts.policyVersion ? `Policy v${facts.policyVersion}` : "No policy yet"}
        </span>
      </div>

      <section aria-label="Program metrics" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Active researchers" value={String(facts.activeResearchers)} detail={`${facts.scopeCount} scope ${facts.scopeCount === 1 ? "entry" : "entries"}`} icon={Users} accent="bg-[#EFF6FF] text-[#2563EB]" />
        <Kpi label="Open reports" value={String(s.open)} detail={`${s.total} submitted in total`} icon={FileText} accent="bg-[#EEF2FF] text-[#4F46E5]" />
        <Kpi label="Open critical" value={String(s.openCritical)} detail={`${s.openHigh} high open`} icon={Flame} accent={s.openCritical > 0 ? "bg-[#FEF3F2] text-[#EF4444]" : "bg-[#ECFDF3] text-[#12B76A]"} />
        <Kpi label="SLA met" value={s.slaMetPercent === null ? "--" : `${s.slaMetPercent}%`} detail={s.slaMetPercent === null ? "No tracked targets yet" : `${s.slaBreached} missed`} icon={ShieldCheck} accent="bg-[#ECFDF3] text-[#12B76A]" />
        <Kpi label="Median time to triage" value={formatHours(facts.resolution?.medianHoursToFirstTriage)} detail="Submission to first triage" icon={Clock} accent="bg-[#F0F9FF] text-[#0284C7]" />
        <Kpi label="Median time to resolve" value={facts.resolution?.medianDaysToResolution == null ? "--" : `${facts.resolution.medianDaysToResolution.toFixed(1)}d`} detail="Submission to resolved" icon={Zap} accent="bg-[#F5F3FF] text-[#7C3AED]" />
        <Kpi label="Bounties paid" value={paid.length === 0 ? "--" : paid.map((row) => formatMoney(row.totalPaidMinorUnits, row.currency)).join(" + ")} detail={`${payouts} ${payouts === 1 ? "payout" : "payouts"}`} icon={DollarSign} accent="bg-[#ECFDF5] text-[#059669]" />
        <Kpi label="Acceptance rate" value={s.acceptancePercent === null ? "--" : `${s.acceptancePercent}%`} detail="Valid of evaluated reports" icon={CheckCircle2} accent="bg-[#FFFBEB] text-[#D97706]" />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section aria-labelledby="pipeline-heading" className="min-w-0 rounded-[16px] border border-[#E7EAF0] bg-white p-5 lg:col-span-7">
          <h2 id="pipeline-heading" className="text-[15px] font-semibold">Report pipeline</h2>
          <ol className="mt-4 space-y-2.5">
            {PIPELINE.map((st) => {
              const n = s.byStatus[st] ?? 0;
              return (
                <li key={st}>
                  <Link prefetch={false} href={`${base}/reports?status=${st}` as Route} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3 rounded-lg px-1 py-0.5 text-[13px] hover:bg-[#F8FAFC]">
                    <span className="truncate font-medium text-[#344054]">{REPORT_STATUS_LABELS[st]}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-[#F2F4F7]"><span className="block h-full rounded-full bg-[#4F46E5]" style={{ width: `${(n / pipelineMax) * 100}%` }} /></span>
                    <span className="text-right font-mono font-semibold">{n}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 border-t border-[#F2F4F7] pt-3 text-[12px] text-[#667085]">{closedInvalid} closed as duplicate, informative, not applicable or rejected.</p>
        </section>

        <section aria-labelledby="attention-heading" className="min-w-0 rounded-[16px] border border-[#E7EAF0] bg-white p-5 lg:col-span-5">
          <h2 id="attention-heading" className="flex items-center gap-2 text-[15px] font-semibold"><AlertTriangle className="size-4 text-[#F79009]" aria-hidden />Needs attention</h2>
          {attention.length === 0 ? (
            <p className="mt-4 text-[13px] text-[#667085]">Nothing needs you right now.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {attention.map((item) => (
                <li key={item.id} className={`flex items-center justify-between gap-3 rounded-[12px] border px-3 py-2.5 text-[13px] ${TONE[item.tone]}`}>
                  <span className="min-w-0 font-medium">{item.title}</span>
                  <Link prefetch={false} href={item.href as Route} className="shrink-0 text-[12px] font-semibold underline-offset-2 hover:underline">{item.action}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

    </div>
  );
}
