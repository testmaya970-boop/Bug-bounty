import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canViewOrganizationAnalytics } from "@/services/authorization";
import { getActorMembership } from "@/services/organization-members";
import { listCurrentUserOrganizations } from "@/services/organizations";
import { getExploreData } from "@/services/analytics-explorer";
import { listProgramsForOrganization } from "@/services/programs";
import { OrganizationServiceError } from "@/services/rpc-error";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";
import { computeAnalytics } from "@/lib/analytics/report-metrics";
import { describeFilters } from "@/lib/analytics/queries";
import { buildExport, exportFileName, EXPORT_TYPES, type ExportFormat } from "@/lib/exports/analytics-files";

// The Explore view as a file: CSV (report rows), Excel (summary + every table) or the PDF
// executive report. Same readers as the page; list_organization_report_facts re-checks in SQL.
export async function GET(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  const membership = await getActorMembership(user.id, organizationId);
  if (!membership || membership.status !== "active" || !canViewOrganizationAnalytics(membership.role)) return new NextResponse("Forbidden", { status: 403 });

  const format = request.nextUrl.searchParams.get("format") as ExportFormat;
  if (!(format in EXPORT_TYPES)) return new NextResponse("Unknown format", { status: 400 });
  const query: Record<string, string[]> = {};
  for (const [key, value] of request.nextUrl.searchParams) (query[key] ??= []).push(value);
  const filters = parseAnalyticsFilters(Object.fromEntries(Object.entries(query).map(([k, v]) => [k, v.length === 1 && !["program", "severity", "status", "asset"].includes(k) ? v[0] : v])));

  let data;
  try {
    data = await getExploreData(organizationId, filters);
  } catch (error) {
    if (error instanceof OrganizationServiceError) return new NextResponse(error.message, { status: 403 });
    throw error;
  }
  const organizationName = (await listCurrentUserOrganizations(user.id)).find((o) => o.id === organizationId)?.name ?? "Organization";
  const programNames = new Map((await listProgramsForOrganization(organizationId)).map((p) => [p.id, p.name]));
  const assetNames = new Map(data.assetOptions.map((a) => [a.assetId, a.assetLabel]));
  const now = new Date();
  const analytics = computeAnalytics(data.facts, data.scopeAssets, filters, now);
  const bytes = buildExport(format, analytics, data.facts, { organizationName, generatedAt: now, filterSummary: describeFilters(filters, { programs: programNames, assets: assetNames }) });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": EXPORT_TYPES[format].contentType,
      "Content-Disposition": `attachment; filename="${exportFileName(organizationName, format, filters)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
