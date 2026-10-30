import { csvRow } from "../csv";
import { minorUnitsToDecimalString } from "../money";
import { reportStatusLabel } from "../report-status";
import { type Analytics, type Money, type ReportFact, SEVERITY_KEYS } from "../analytics/report-metrics";
import { buildXlsx } from "./xlsx";
import { ACCENT, CONTENT_W, MARGIN, MUTED, PdfDocument } from "./pdf";

// The three export formats, all built from the same computed analytics and report rows.

export type ExportFormat = "csv" | "xlsx" | "pdf";
export type ExportMeta = { organizationName: string; generatedAt: Date; filterSummary: string[] };

export const EXPORT_TYPES: Record<ExportFormat, { contentType: string; extension: string; label: string }> = {
  csv: { contentType: "text/csv; charset=utf-8", extension: "csv", label: "CSV" },
  xlsx: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx", label: "Excel" },
  pdf: { contentType: "application/pdf", extension: "pdf", label: "PDF report" },
};

const SEVERITY_LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", none: "Info", unrated: "Not yet rated" };
const hours = (h: number | null) => (h === null ? "" : Math.round(h * 10) / 10);
const money = (m: Money[]) => m.map((x) => `${x.currency} ${minorUnitsToDecimalString(x.minorUnits)}`).join(", ");
const iso = (s: string | null) => (s ? new Date(s).toISOString().replace(".000Z", "Z") : "");

const REPORT_HEADER = ["Report id", "Title", "Program", "Asset", "Severity", "CVSS", "Status", "Researcher", "Submitted (UTC)", "First response (UTC)", "Triaged (UTC)", "Closed (UTC)", "Hours to first response", "Bounty currency", "Bounty awarded", "Bounty paid"];

function reportRow(f: ReportFact) {
  return [
    f.reportId,
    f.title,
    f.programName,
    f.assetLabel ?? "",
    SEVERITY_LABEL[f.severity ?? "unrated"],
    f.cvssScore ?? "",
    reportStatusLabel(f.status),
    f.researcherName ?? "",
    iso(f.submittedAt),
    iso(f.firstResponseAt),
    iso(f.triagedAt),
    iso(f.closedAt),
    f.firstResponseAt ? hours((new Date(f.firstResponseAt).getTime() - new Date(f.submittedAt).getTime()) / 3_600_000) : "",
    f.bountyCurrency ?? "",
    f.bountyAwardedMinorUnits === null ? "" : Number(minorUnitsToDecimalString(f.bountyAwardedMinorUnits)),
    f.bountyPaidMinorUnits ? Number(minorUnitsToDecimalString(f.bountyPaidMinorUnits)) : "",
  ];
}

export function buildCsv(facts: ReportFact[]): Uint8Array {
  // Leading BOM so Excel opens accented names correctly.
  return new TextEncoder().encode("﻿" + csvRow(REPORT_HEADER) + facts.map((f) => csvRow(reportRow(f))).join(""));
}

function summaryRows(a: Analytics, meta: ExportMeta): (string | number)[][] {
  const k = a.kpis;
  return [
    ["Organization", meta.organizationName],
    ["Period", `${a.range.from} to ${a.range.to}`],
    ["Generated (UTC)", meta.generatedAt.toISOString().replace(/\.\d+Z$/, "Z")],
    ...meta.filterSummary.map((f) => ["Filter", f]),
    ["Reports received", k.total],
    ["Valid reports (accepted or resolved)", k.valid],
    ["Validity rate of closed reports (%)", k.validRate ?? ""],
    ["Open reports", k.open],
    ["Open critical or high", k.criticalHighOpen],
    ["MTTA: median hours to first response", hours(k.mttaHours)],
    ["Median hours to triage", hours(k.medianTriageHours)],
    ["MTTR: median days to resolve", hours(k.mttrDays)],
    ["SLA compliance (%)", k.slaCompliance ?? ""],
    ["SLA checkpoints met / missed", `${k.slaMet} / ${k.slaBreached}`],
    ["Bounties awarded", money(k.awarded) || "None"],
    ["Bounties paid", money(k.paid) || "None"],
    ["Researchers reporting", k.researchers],
    ["Asset coverage (%)", k.assetCoverage ?? ""],
    ["In-scope assets with a report", `${k.assetsCovered} of ${k.assetsInScope}`],
  ];
}

export function buildWorkbook(a: Analytics, facts: ReportFact[], meta: ExportMeta): Uint8Array {
  return buildXlsx([
    { name: "Summary", header: ["Metric", "Value"], rows: summaryRows(a, meta) },
    { name: "Reports", header: REPORT_HEADER, rows: facts.map(reportRow) },
    {
      name: "Severity trend",
      header: ["Week starting", ...SEVERITY_KEYS.map((s) => SEVERITY_LABEL[s]), "Total", "MTTA hours"],
      rows: a.weekly.map((w) => [w.weekStart, ...SEVERITY_KEYS.map((s) => w[s]), w.total, hours(w.mttaHours)]),
    },
    {
      name: "Program health",
      header: ["Program", "Health score", "Health", "Reports", "Open", "Open critical/high", "Open over 30 days", "SLA compliance (%)", "MTTA hours", "MTTR days", "Paid"],
      rows: a.programs.map((p) => [p.programName, p.healthScore, p.healthLabel, p.total, p.open, p.criticalHighOpen, p.agingOver30Days, p.slaCompliance ?? "", hours(p.mttaHours), hours(p.mttrDays), money(p.paid)]),
    },
    {
      name: "Researchers",
      header: ["Researcher", "Reports", "Valid", "Validity rate (%)", "Critical", "High", "Average CVSS", "Paid", "Last report (UTC)"],
      rows: a.researchers.map((r) => [r.researcherName, r.total, r.valid, r.validRate ?? "", r.critical, r.high, r.averageCvss ?? "", money(r.paid), iso(r.lastSubmittedAt)]),
    },
    {
      name: "Assets",
      header: ["Asset", "Type", "In scope", "Reports", "Valid", "Open", "Last report (UTC)"],
      rows: a.assets.map((x) => [x.assetLabel, x.assetType, x.inScope ? "Yes" : "No", x.reports, x.valid, x.open, iso(x.lastReportAt)]),
    },
  ]);
}

const SEVERITY_FILL: Record<string, [number, number, number]> = {
  critical: [0.75, 0.1, 0.12],
  high: [0.9, 0.42, 0.12],
  medium: [0.92, 0.7, 0.15],
  low: [0.25, 0.5, 0.85],
  none: [0.55, 0.58, 0.62],
  unrated: [0.75, 0.77, 0.8],
};

/** The executive report: one page of headline numbers, then trends, program health, researchers and assets. */
export function buildExecutivePdf(a: Analytics, meta: ExportMeta): Uint8Array {
  const doc = new PdfDocument(`${meta.organizationName} - Security program report - ${a.range.from} to ${a.range.to}`);
  const k = a.kpis;

  doc.rect(MARGIN, doc.cursor, 4, 42, ACCENT);
  doc.text(MARGIN + 14, doc.cursor, "Security program report", 20, { bold: true });
  doc.text(MARGIN + 14, doc.cursor + 26, `${meta.organizationName}  |  ${a.range.from} to ${a.range.to}`, 10, { color: MUTED });
  doc.cursor += 60;
  if (meta.filterSummary.length) doc.paragraph(`Filtered to: ${meta.filterSummary.join("; ")}.`, 9, { color: MUTED });

  // Headline numbers, 3 per row.
  const tiles: [string, string, string][] = [
    ["Reports received", String(k.total), `${k.valid} valid${k.validRate === null ? "" : `, ${k.validRate}% of closed`}`],
    ["Open critical or high", String(k.criticalHighOpen), `${k.open} open in total`],
    ["SLA compliance", k.slaCompliance === null ? "--" : `${k.slaCompliance}%`, `${k.slaMet} met, ${k.slaBreached} missed`],
    ["MTTA (first response)", k.mttaHours === null ? "--" : `${hours(k.mttaHours)} h`, "Median, submission to first response"],
    ["MTTR (resolution)", k.mttrDays === null ? "--" : `${hours(k.mttrDays)} days`, "Median, submission to resolved"],
    ["Bounties paid", money(k.paid) || "None", money(k.awarded) ? `Awarded: ${money(k.awarded)}` : "No awards in period"],
    ["Asset coverage", k.assetCoverage === null ? "--" : `${k.assetCoverage}%`, `${k.assetsCovered} of ${k.assetsInScope} in-scope assets reported on`],
    ["Researchers", String(k.researchers), "Submitted at least one report"],
    ["Median time to triage", k.medianTriageHours === null ? "--" : `${hours(k.medianTriageHours)} h`, "Submission to triage started"],
  ];
  const tileW = CONTENT_W / 3;
  for (let i = 0; i < tiles.length; i += 3) {
    doc.ensure(62);
    tiles.slice(i, i + 3).forEach(([label, value, hint], j) => {
      const x = MARGIN + j * tileW;
      doc.text(x, doc.cursor, label, 8.5, { color: MUTED });
      doc.text(x, doc.cursor + 13, value.length > 22 ? value.slice(0, 22) : value, 16, { bold: true });
      doc.text(x, doc.cursor + 35, hint.length > 44 ? `${hint.slice(0, 41)}...` : hint, 7.5, { color: MUTED });
    });
    doc.cursor += 58;
  }

  doc.heading("Reports by severity");
  doc.bars(SEVERITY_KEYS.map((s) => ({ label: SEVERITY_LABEL[s], value: a.bySeverity[s], display: String(a.bySeverity[s]), fill: SEVERITY_FILL[s] })));

  doc.heading("Weekly report volume");
  doc.bars(a.weekly.slice(-16).map((w) => ({ label: `Week of ${w.weekStart}`, value: w.total, display: String(w.total), fill: [0.3, 0.33, 0.38] })));

  doc.heading("Program health");
  doc.paragraph("Score out of 100: missed SLA checkpoints cost up to 40 points, open reports older than 30 days up to 30, and open critical or high reports up to 30.", 8.5, { color: MUTED });
  doc.table(
    [
      { label: "Program", width: 150 },
      { label: "Health", width: 70 },
      { label: "Reports", width: 50, align: "right" },
      { label: "Open", width: 45, align: "right" },
      { label: "Crit/High open", width: 70, align: "right" },
      { label: "SLA %", width: 50, align: "right" },
      { label: "MTTA h", width: 64, align: "right" },
    ],
    a.programs.map((p) => [p.programName, `${p.healthScore} ${p.healthLabel}`, String(p.total), String(p.open), String(p.criticalHighOpen), p.slaCompliance === null ? "--" : String(p.slaCompliance), p.mttaHours === null ? "--" : String(hours(p.mttaHours))]),
  );

  doc.heading("Top researchers");
  doc.table(
    [
      { label: "Researcher", width: 170 },
      { label: "Reports", width: 55, align: "right" },
      { label: "Valid", width: 50, align: "right" },
      { label: "Critical", width: 55, align: "right" },
      { label: "High", width: 45, align: "right" },
      { label: "Paid", width: 124, align: "right" },
    ],
    a.researchers.slice(0, 15).map((r) => [r.researcherName, String(r.total), String(r.valid), String(r.critical), String(r.high), money(r.paid) || "--"]),
  );

  doc.heading("Asset coverage");
  doc.table(
    [
      { label: "Asset", width: 230 },
      { label: "In scope", width: 60 },
      { label: "Reports", width: 60, align: "right" },
      { label: "Valid", width: 60, align: "right" },
      { label: "Open", width: 89, align: "right" },
    ],
    a.assets.slice(0, 25).map((x) => [x.assetLabel, x.inScope ? "Yes" : "No", String(x.reports), String(x.valid), String(x.open)]),
  );

  doc.paragraph(`Generated ${meta.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC by Unpatched. Times are medians; SLA targets come from each program's published policy.`, 8, { color: MUTED });
  return doc.toBytes();
}

export function buildExport(format: ExportFormat, a: Analytics, facts: ReportFact[], meta: ExportMeta): Uint8Array {
  if (format === "csv") return buildCsv(facts);
  if (format === "xlsx") return buildWorkbook(a, facts, meta);
  return buildExecutivePdf(a, meta);
}

export function exportFileName(organizationName: string, format: ExportFormat, range: { from: string; to: string }): string {
  const slug = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "organization";
  return `${slug}-security-report-${range.from}-to-${range.to}.${EXPORT_TYPES[format].extension}`;
}
