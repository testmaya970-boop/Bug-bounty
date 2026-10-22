import { NextResponse, type NextRequest } from "next/server";
import { withActorTransaction } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManageMembers } from "@/services/authorization";
import { getActorMembership } from "@/services/organization-members";
import { activityActionLabel } from "@/lib/organization-activity-labels";
import { rangeDays } from "@/lib/viz";
import { csvCell } from "@/lib/csv";

// CSV export of the organization's audit log for the selected window. Same readers as the
// page (owner / security_admin), and the query itself still runs under the audit log's own
// row-level policy -- the role check here only turns a refusal into a clear 403.
const MAX_ROWS = 20_000;

export async function GET(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  const membership = await getActorMembership(user.id, organizationId);
  if (!membership || membership.status !== "active" || !canManageMembers(membership.role)) return new NextResponse("Forbidden", { status: 403 });

  const days = rangeDays(request.nextUrl.searchParams.get("range") ?? undefined);
  const rows = await withActorTransaction(user.id, (client) =>
    client
      .query<{ created_at: string; actor: string | null; action: string; entity_type: string; entity_id: string | null; metadata: unknown }>(
        `select a.created_at, case when u.id is null then null when u.deactivated_at is not null then 'Deactivated account' else u.display_name end as actor,
                a.action, a.entity_type, a.entity_id, a.metadata
           from public.audit_logs a left join public.users u on u.id = a.actor_id
          where a.organization_id = $1 and a.created_at >= now() - make_interval(days => $2)
          order by a.created_at desc limit $3`,
        [organizationId, days, MAX_ROWS],
      )
      .then((r) => r.rows),
  );

  const header = ["Time (UTC)", "Actor", "Action", "Description", "Entity type", "Entity id", "Details"];
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push([new Date(row.created_at).toISOString(), row.actor ?? "System", row.action, activityActionLabel(row.action), row.entity_type, row.entity_id, row.metadata].map(csvCell).join(","));
  }

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-${organizationId.slice(0, 8)}-${days}d.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
