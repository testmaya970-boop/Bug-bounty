import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import type { ProgramStatus } from "@/types/program";
import type { ReportStatus } from "@/types/report";

export type SearchResults = {
  programs: { id: string; organizationId: string; name: string; organizationName: string; status: ProgramStatus }[];
  reports: { id: string; organizationId: string; programId: string; title: string; programName: string; status: ReportStatus }[];
  researchers: { id: string; displayName: string; username: string }[];
};

/** One search across programs, reports and public researcher profiles (search_everything,
 * 202610190001). The database decides visibility: invited private programs and the caller's
 * own or triaged reports appear; nothing else does. */
export async function searchEverything(query: string): Promise<SearchResults> {
  const empty: SearchResults = { programs: [], reports: [], researchers: [] };
  if (query.trim().length < 2) return empty;
  const actor = await getCurrentUser();
  type Row = { kind: "program" | "report" | "researcher"; id: string; title: string; subtitle: string; organization_id: string | null; program_id: string | null; slug: string | null; status: string | null };
  let rows: Row[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<Row>(client, "public.search_everything", [query, 8]));
  } catch (error) {
    mapError(error as { message: string });
  }
  for (const r of rows) {
    if (r.kind === "program") empty.programs.push({ id: r.id, organizationId: r.organization_id!, name: r.title, organizationName: r.subtitle, status: r.status as ProgramStatus });
    else if (r.kind === "report") empty.reports.push({ id: r.id, organizationId: r.organization_id!, programId: r.program_id!, title: r.title, programName: r.subtitle, status: r.status as ReportStatus });
    else empty.researchers.push({ id: r.id, displayName: r.title, username: r.slug! });
  }
  return empty;
}
