import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import type { ReportWeaknessType } from "@/types/report";

/** Real, reusable composer boilerplate (public.report_templates) -- a template only ever
 * pre-fills the real composer form; it never bypasses submit_report's own validation.
 * See docs/decisions/0055. */
export type ReportTemplate = {
  id: string;
  name: string;
  weaknessType: ReportWeaknessType | null;
  descriptionTemplate: string | null;
  impactTemplate: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReportTemplateRow = {
  id: string;
  name: string;
  weakness_type: ReportWeaknessType | null;
  description_template: string | null;
  impact_template: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: ReportTemplateRow): ReportTemplate {
  return {
    id: row.id,
    name: row.name,
    weaknessType: row.weakness_type,
    descriptionTemplate: row.description_template,
    impactTemplate: row.impact_template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMyReportTemplates(): Promise<ReportTemplate[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ReportTemplateRow>(client, "public.list_my_report_templates"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapRow);
}

export async function upsertMyReportTemplate(input: { id?: string; name: string; weaknessType?: ReportWeaknessType; descriptionTemplate?: string; impactTemplate?: string }): Promise<ReportTemplate> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<ReportTemplateRow>(client, "public.upsert_my_report_template", [
        input.id ?? null,
        input.name,
        input.weaknessType ?? null,
        input.descriptionTemplate ?? null,
        input.impactTemplate ?? null,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapRow(rows[0]);
}

export async function deleteMyReportTemplate(id: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.delete_my_report_template", [id]));
  } catch (error) {
    mapError(error as { message: string });
  }
}
