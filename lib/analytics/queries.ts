import type { AnalyticsFilters } from "./filters";

export function describeFilters(
  filters: AnalyticsFilters,
  names: { programs: Map<string, string>; assets: Map<string, string> },
): string {
  const parts: string[] = [`${filters.from} to ${filters.to}`];
  if (filters.programIds.length > 0) {
    parts.push(
      `Programs: ${filters.programIds.map((id) => names.programs.get(id) ?? id).join(", ")}`,
    );
  }
  if (filters.severities.length > 0) {
    parts.push(`Severities: ${filters.severities.join(", ")}`);
  }
  if (filters.statuses.length > 0) {
    parts.push(`Statuses: ${filters.statuses.join(", ")}`);
  }
  if (filters.assetIds.length > 0) {
    parts.push(
      `Assets: ${filters.assetIds.map((id) => names.assets.get(id) ?? id).join(", ")}`,
    );
  }
  return parts.join(" · ");
}
