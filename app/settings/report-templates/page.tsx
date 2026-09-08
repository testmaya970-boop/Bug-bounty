import React from "react";
import { ReportTemplatesSettings } from "../../../components/settings/report-templates-settings";
import { listMyReportTemplates } from "../../../services/report-templates";

export default async function ReportTemplatesSettingsPage() {
  const templates = await listMyReportTemplates();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Report Templates</h1>
        <p className="mt-1 text-sm text-ink-muted">Reusable boilerplate for your report composer.</p>
      </div>
      <ReportTemplatesSettings templates={templates} />
    </div>
  );
}
