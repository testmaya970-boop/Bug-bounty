import { NextResponse, type NextRequest } from "next/server";
import { withActorTransaction } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManageMembers } from "@/services/authorization";
import { AUDIT_CATEGORIES, getActorMembership, type AuditCategory } from "@/services/organization-members";
import { describeAuditChange } from "@/lib/audit-change";
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

  // The page's filters (category, text, dates) when given; otherwise the selected window.
  const sp = request.nextUrl.searchParams;
  const isDate = (v: string | null) => (v && /^d{4}-d{2}-d{2}$/.test(v) ? v : null);
  const days = rangeDays(sp.get("range") ?? undefined);
  const category = AUDIT_CATEGORIES.includes(sp.get("category") as AuditCategory) ? sp.get("category") : null;
  const from = isDate(sp.get("from")) ?? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const to = isDate(sp.get("to"));
  const query = sp.get("q")?.trim().slice(0, 100) || null;
  type Row = { id: string; created_at: string; actor_id: string | null; actor_name: string | null; action: string; entity_type: string; entity_id: string | null; metadata: Record<string, unknown> };
  const rows: Row[] = [];
  await withActorTransaction(user.id, async (client) => {
    let before: Row | undefined;
    while (rows.length < MAX_ROWS) {
      const page = (
        await client.query<Row>("select * from public.search_organization_audit_log($1, $2, $3, $4, $5, $6, $7, 200)", [organizationId, category, query, from, to, before?.created_at ?? null, before?.id ?? null])
      ).rows;
      rows.push(...page);
      if (page.length < 200) break;
      before = page[page.length - 1];
    }
  });

  const header = ["Time (UTC)", "Actor", "Action", "Description", "What changed", "Entity type", "Entity id", "Details"];
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push([new Date(row.created_at).toISOString(), row.actor_id ? (row.actor_name ?? "Former member") : "System", row.action, activityActionLabel(row.action), describeAuditChange(row.metadata).join("; "), row.entity_type, row.entity_id, row.metadata].map(csvCell).join(","));
  }

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${organizationId.slice(0, 8)}-${from}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
