import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canViewOrganizationAnalytics } from "@/services/authorization";
import { getActorMembership } from "@/services/organization-members";
import { listOrganizationReportTimings } from "@/services/organization-analytics";
import { csvRow } from "@/lib/csv";
import { minorUnitsToDecimalString } from "@/lib/money";
import { rangeDays } from "@/lib/viz";

// Report-level response-time dataset for the selected window (one row per report). Same
// readers as the analytics page; list_organization_report_timings re-checks the role in SQL.
const HEADER = ["Report id", "Submitted (UTC)", "Program", "Severity", "Status", "First response (UTC)", "Triaged (UTC)", "Bounty amount", "Bounty currency", "Resolved (UTC)"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  const membership = await getActorMembership(user.id, organizationId);
  if (!membership || membership.status !== "active" || !canViewOrganizationAnalytics(membership.role)) return new NextResponse("Forbidden", { status: 403 });

  const days = rangeDays(request.nextUrl.searchParams.get("range") ?? undefined);
  const rows = await listOrganizationReportTimings(organizationId, days);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(csvRow(HEADER)));
      for (const r of rows) {
        controller.enqueue(
          encoder.encode(
            csvRow([
              r.reportId,
              r.submittedAt,
              r.programName,
              r.severity ?? "",
              r.status,
              r.firstResponseAt,
              r.triagedAt,
              r.bountyAmountMinorUnits === null ? "" : minorUnitsToDecimalString(r.bountyAmountMinorUnits),
              r.bountyCurrency,
              r.resolvedAt,
            ]),
          ),
        );
      }
      controller.close();
    },
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="response-times-${organizationId.slice(0, 8)}-${days}d.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
