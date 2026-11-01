import { NextResponse, type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getExportRunFile } from "@/services/analytics-explorer";
import { EXPORT_TYPES } from "@/lib/exports/analytics-files";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A stored scheduled-export file (the emailed link). RLS decides: the person who scheduled it,
// or the organization's owners and security admins. Anyone else gets the same 404.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ organizationId: string; runId: string }> }) {
  const { organizationId, runId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/analytics/exports/${runId}`);
  if (!UUID.test(organizationId) || !UUID.test(runId)) return new NextResponse("Not found", { status: 404 });
  const file = await getExportRunFile(organizationId, runId);
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(file.content), {
    headers: {
      "Content-Type": EXPORT_TYPES[file.format].contentType,
      "Content-Disposition": `attachment; filename="${file.fileName.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
