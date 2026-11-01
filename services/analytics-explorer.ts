import type { AnalyticsFilters } from "../lib/analytics/filters";
import type {
  ReportFact,
  ScopeAssetFact,
} from "../lib/analytics/report-metrics";
import type { ExportFormat } from "../lib/exports/analytics-files";

export interface ExportSchedule {
  id: string;
  name: string;
  format: ExportFormat;
  frequency: "weekly" | "monthly";
  filters: Record<string, string[]>;
  nextRunAt: string;
  createdBy: string;
  createdByName: string | null;
}

export interface ExportRun {
  id: string;
  scheduleName: string | null;
  format: ExportFormat;
  periodFrom: string;
  periodTo: string;
  status: "ready" | "failed";
  byteSize: number | null;
  error: string | null;
  createdAt: string;
}

export async function getExploreData(
  _organizationId: string,
  _filters: AnalyticsFilters,
): Promise<{
  facts: ReportFact[];
  scopeAssets: ScopeAssetFact[];
  assetOptions: { assetId: string; assetLabel: string }[];
}> {
  return { facts: [], scopeAssets: [], assetOptions: [] };
}

export async function listExportSchedules(
  _organizationId: string,
): Promise<ExportSchedule[]> {
  return [];
}

export async function listExportRuns(
  _organizationId: string,
): Promise<ExportRun[]> {
  return [];
}

export async function createExportSchedule(
  _organizationId: string,
  _name: string,
  _format: ExportFormat,
  _frequency: "weekly" | "monthly",
  _filters: Record<string, string[]>,
): Promise<void> {}

export async function deleteExportSchedule(_scheduleId: string): Promise<void> {}

export async function getExportRunFile(
  _organizationId: string,
  _runId: string,
): Promise<{
  fileName: string;
  format: ExportFormat;
  content: Buffer;
} | null> {
  return null;
}
