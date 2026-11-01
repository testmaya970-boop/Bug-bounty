import type { AnalyticsFilters } from "../analytics/filters";
import type { ComputedAnalytics, ReportFact } from "../analytics/report-metrics";

export type ExportFormat = "csv" | "xlsx" | "pdf";

export const EXPORT_TYPES: Record<
  ExportFormat,
  { label: string; contentType: string; ext: string }
> = {
  csv: {
    label: "CSV",
    contentType: "text/csv; charset=utf-8",
    ext: "csv",
  },
  xlsx: {
    label: "Excel",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
  },
  pdf: {
    label: "PDF",
    contentType: "application/pdf",
    ext: "pdf",
  },
};

export function exportFileName(
  organizationName: string,
  format: ExportFormat,
  filters: AnalyticsFilters,
): string {
  const slug =
    organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "organization";
  return `${slug}-analytics-${filters.from}-to-${filters.to}.${EXPORT_TYPES[format].ext}`;
}

function escapeCsv(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? "" : String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildExport(
  format: ExportFormat,
  analytics: ComputedAnalytics,
  facts: ReportFact[],
  meta: {
    organizationName: string;
    generatedAt: Date;
    filterSummary: string;
  },
): Uint8Array {
  const header = [
    "Report ID",
    "Title",
    "Program",
    "Researcher",
    "Asset",
    "Severity",
    "Status",
    "CVSS",
    "Submitted At",
    "First Response At",
    "Resolved At",
  ];
  const rows = facts.map((f) => [
    f.reportId,
    f.title,
    f.programName,
    f.researcherName,
    f.assetLabel ?? "",
    f.severity ?? "unrated",
    f.status,
    f.cvssScore ?? "",
    f.submittedAt,
    f.firstResponseAt ?? "",
    f.resolvedAt ?? "",
  ]);

  if (format === "csv") {
    const csv = [
      `# ${meta.organizationName} - Security Analytics (${meta.filterSummary})`,
      `# Total Reports: ${analytics.kpis.total}, Valid: ${analytics.kpis.valid}, Open: ${analytics.kpis.open}`,
      header.map(escapeCsv).join(","),
      ...rows.map((r) => r.map(escapeCsv).join(",")),
    ].join("\n");
    return new TextEncoder().encode(csv);
  }

  const summaryText = `${meta.organizationName} Security Analytics (${meta.filterSummary})\nGenerated: ${meta.generatedAt.toISOString()}\nTotal: ${analytics.kpis.total} | Valid: ${analytics.kpis.valid} | Open: ${analytics.kpis.open}`;
  return new TextEncoder().encode(summaryText);
}
