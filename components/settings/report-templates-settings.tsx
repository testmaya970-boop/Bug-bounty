"use client";

import React, { useState, useTransition } from "react";
import { Input, Select, Textarea } from "../ui/form";
import { Button, IconButton } from "../ui/button";
import { Alert } from "../ui/feedback";
import { upsertMyReportTemplateAction, deleteMyReportTemplateAction } from "../../actions/report-templates";
import { WEAKNESS_TYPE_ORDER, weaknessTypeLabel } from "../../lib/report-weakness-labels";
import type { ReportTemplate } from "../../services/report-templates";
import type { ReportWeaknessType } from "../../types/report";
import { PencilSimple, Trash } from "@phosphor-icons/react";

const EMPTY_DRAFT = { id: undefined as string | undefined, name: "", weaknessType: "" as ReportWeaknessType | "", descriptionTemplate: "", impactTemplate: "" };

/** Real, reusable composer boilerplate (public.report_templates) -- pre-fills the real
 * report composer; never bypasses submit_report's own validation. See
 * docs/decisions/0055.
 *
 * The list is local state, updated immediately from the real server action's own
 * returned row -- never a `router.refresh()` round-trip the user has to wait on before
 * seeing their own save/delete reflected (docs/decisions/0055.1). */
export function ReportTemplatesSettings({ templates: initialTemplates }: { templates: ReportTemplate[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function startEdit(template?: ReportTemplate) {
    setError(null);
    setDraft(
      template
        ? { id: template.id, name: template.name, weaknessType: template.weaknessType ?? "", descriptionTemplate: template.descriptionTemplate ?? "", impactTemplate: template.impactTemplate ?? "" }
        : EMPTY_DRAFT,
    );
    setEditing(true);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await upsertMyReportTemplateAction({
        id: draft.id,
        name: draft.name,
        weaknessType: draft.weaknessType || undefined,
        descriptionTemplate: draft.descriptionTemplate || undefined,
        impactTemplate: draft.impactTemplate || undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTemplates((current) => {
        const exists = current.some((t) => t.id === result.data.id);
        return exists ? current.map((t) => (t.id === result.data.id ? result.data : t)) : [result.data, ...current];
      });
      setEditing(false);
      setDraft(EMPTY_DRAFT);
    });
  }

  function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);
    startTransition(async () => {
      const result = await deleteMyReportTemplateAction({ id });
      if (!result.ok) {
        setError(result.message);
        setDeletingId(null);
        return;
      }
      setTemplates((current) => current.filter((t) => t.id !== id));
    });
  }

  return (
    <div className="space-y-6">
      {!editing && (
        <div className="flex justify-end">
          <Button onClick={() => startEdit()}>New template</Button>
        </div>
      )}

      {editing && (
        <form className="space-y-4 rounded-lg border border-border bg-surface p-4" onSubmit={handleSubmit}>
          <Input label="Template name" required value={draft.name} onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))} maxLength={100} />
          <Select label="Weakness type" value={draft.weaknessType} onChange={(event) => setDraft((d) => ({ ...d, weaknessType: event.target.value as ReportWeaknessType }))}>
            <option value="">Not set</option>
            {WEAKNESS_TYPE_ORDER.map((wt) => (
              <option key={wt} value={wt}>
                {weaknessTypeLabel(wt)}
              </option>
            ))}
          </Select>
          <Textarea label="Description template" value={draft.descriptionTemplate} onChange={(event) => setDraft((d) => ({ ...d, descriptionTemplate: event.target.value }))} maxLength={10000} className="[&_textarea]:min-h-32" />
          <Textarea label="Impact template" value={draft.impactTemplate} onChange={(event) => setDraft((d) => ({ ...d, impactTemplate: event.target.value }))} maxLength={5000} className="[&_textarea]:min-h-24" />
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Save template
            </Button>
          </div>
        </form>
      )}

      {templates.length === 0 && !editing && <Alert tone="info" title="No templates yet">Save a composer draft as a template to reuse it on your next report.</Alert>}

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {templates.map((template) => (
          <li key={template.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{template.name}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{template.weaknessType ? weaknessTypeLabel(template.weaknessType) : "No weakness type set"}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <IconButton label="Edit" variant="secondary" onClick={() => startEdit(template)}>
                <PencilSimple aria-hidden="true" className="size-[18px]" />
              </IconButton>
              <IconButton label="Delete" variant="quiet" className="text-danger" pending={pending && deletingId === template.id} onClick={() => handleDelete(template.id)}>
                {!(pending && deletingId === template.id) && <Trash aria-hidden="true" className="size-[18px]" />}
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
