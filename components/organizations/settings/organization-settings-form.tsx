"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, RotateCcw, Upload } from "lucide-react";
import { Input, Select, Switch } from "../../ui/form";
import { Button } from "../../ui/button";
import { updateOrganizationSettingsAction } from "../../../actions/organizations";
import {
  DATE_FORMATS,
  DEFAULT_ORGANIZATION_SETTINGS,
  LANGUAGES,
  WEEKDAYS,
  organizationSettingsSchema,
  type OrganizationSettings,
} from "../../../lib/organization-settings";

const TIME_ZONES = ["UTC", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"];

function Card({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <h2 id={`${id}-heading`} className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{description}</p>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** General, Regional, Program defaults and Researcher defaults: one form, one save. */
export function OrganizationSettingsForm({ organizationId, organizationName, initial, canEdit }: { organizationId: string; organizationName: string; initial: OrganizationSettings; canEdit: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const set = <K extends keyof OrganizationSettings>(key: K, value: OrganizationSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setNotice(null);
  };
  const issue = (key: keyof OrganizationSettings) => {
    const result = organizationSettingsSchema.safeParse(form);
    return result.success ? undefined : result.error.issues.find((i) => i.path[0] === key)?.message;
  };
  const disabled = !canEdit || pending;

  function save() {
    const parsed = organizationSettingsSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the settings.");
    setError(null);
    startTransition(async () => {
      const result = await updateOrganizationSettingsAction({ organizationId, settings: parsed.data });
      if (!result.ok) return setError(result.message);
      setSaved(parsed.data);
      setNotice("Settings saved.");
      router.refresh();
    });
  }

  function exportConfiguration() {
    const blob = new Blob([JSON.stringify({ organization: organizationName, exportedAt: new Date().toISOString(), settings: saved }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unpatched-settings-${organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importConfiguration(file: File) {
    try {
      const json = JSON.parse(await file.text()) as { settings?: unknown };
      const parsed = organizationSettingsSchema.safeParse({ ...DEFAULT_ORGANIZATION_SETTINGS, ...(json.settings as object) });
      if (!parsed.success) return setError(`That file isn't a valid configuration: ${parsed.error.issues[0]?.message}`);
      setForm(parsed.data);
      setError(null);
      setNotice("Configuration loaded. Review it, then save.");
    } catch {
      setError("That file isn't a valid configuration.");
    }
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportConfiguration}><Download aria-hidden className="size-4" />Export configuration</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload aria-hidden className="size-4" />Import configuration</Button>
          <Button variant="quiet" onClick={() => { setForm(DEFAULT_ORGANIZATION_SETTINGS); setNotice("Platform defaults loaded. Save to apply them."); }}><RotateCcw aria-hidden className="size-4" />Reset defaults</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Configuration file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importConfiguration(f); e.target.value = ""; }} />
        </div>
      )}

      <Card id="general" title="General" description="How this workspace shows times, dates and money to your team.">
        <Select label="Default language" helperText="Language for organization emails and new members." value={form.defaultLanguage} disabled={disabled} onChange={(e) => set("defaultLanguage", e.target.value as OrganizationSettings["defaultLanguage"])}>
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </Select>
        <Select label="Time zone" helperText="Used for SLA business hours and scheduled exports." value={form.timeZone} disabled={disabled} onChange={(e) => set("timeZone", e.target.value)}>
          {[...new Set([form.timeZone, ...TIME_ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}
        </Select>
        <Select label="Date format" value={form.dateFormat} disabled={disabled} onChange={(e) => set("dateFormat", e.target.value as OrganizationSettings["dateFormat"])}>
          {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </Select>
        <Select label="Currency" helperText="How amounts are shown across the workspace." value={form.currency} disabled={disabled} onChange={(e) => set("currency", e.target.value as "USD" | "INR")}>
          <option value="USD">USD</option>
          <option value="INR">INR</option>
        </Select>
        <Input type="time" label="Business hours start" value={form.businessHoursStart} disabled={disabled} onChange={(e) => set("businessHoursStart", e.target.value)} />
        <Input type="time" label="Business hours end" error={issue("businessHoursEnd")} value={form.businessHoursEnd} disabled={disabled} onChange={(e) => set("businessHoursEnd", e.target.value)} />
        <div className="sm:col-span-2">
          <Input type="email" label="Support contact" helperText="Where researchers and Unpatched reach your security team." placeholder="security@yourcompany.com" error={form.supportEmail ? issue("supportEmail") : undefined} value={form.supportEmail} disabled={disabled} onChange={(e) => set("supportEmail", e.target.value)} />
        </div>
      </Card>

      <Card id="regional" title="Regional settings" description="Where your organization operates, for working days and payout records.">
        <Input label="Country" helperText="Two-letter code, for example IN or US." maxLength={2} error={issue("country")} value={form.country} disabled={disabled} onChange={(e) => set("country", e.target.value.toUpperCase())} />
        <fieldset className="min-w-0">
          <legend className="mb-1 block text-[13px] font-medium text-ink">Working days</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = form.workingDays.includes(d.value);
              return (
                <button key={d.value} type="button" aria-pressed={on} disabled={disabled} onClick={() => set("workingDays", on ? form.workingDays.filter((x) => x !== d.value) : [...form.workingDays, d.value].sort())} className={`h-9 min-w-11 rounded-lg border px-2.5 text-[13px] font-medium transition-colors ${on ? "border-action bg-[#EFF6FF] text-[#1D4ED8]" : "border-border bg-surface text-ink-muted hover:border-border-strong"}`}>
                  {d.label}
                </button>
              );
            })}
          </div>
          {issue("workingDays") && <p className="mt-1 text-[12px] text-danger">{issue("workingDays")}</p>}
        </fieldset>
      </Card>

      <Card id="program-defaults" title="Program defaults" description="Every new engagement in the Launch Program Studio starts from these. Each program can still change them.">
        <Select label="Default visibility" value={form.defaultVisibility} disabled={disabled} onChange={(e) => set("defaultVisibility", e.target.value as "public" | "private")}>
          <option value="private">Private: invited researchers only</option>
          <option value="public">Public: listed for every researcher</option>
        </Select>
        <Select label="Default reward currency" value={form.defaultRewardCurrency} disabled={disabled} onChange={(e) => set("defaultRewardCurrency", e.target.value as "USD" | "INR")}>
          <option value="USD">USD</option>
          <option value="INR">INR</option>
        </Select>
        <Input type="number" min={1} max={720} label="First response target (hours)" helperText="How soon a new report gets its first reply." value={form.defaultFirstResponseHours} disabled={disabled} onChange={(e) => set("defaultFirstResponseHours", Number(e.target.value))} />
        <Input type="number" min={1} max={2160} label="Triage target (hours)" error={issue("defaultTriageHours")} value={form.defaultTriageHours} disabled={disabled} onChange={(e) => set("defaultTriageHours", Number(e.target.value))} />
        <Input type="number" min={1} max={365} label="Resolution target (days)" helperText="Time to fix a confirmed vulnerability." value={form.defaultResolutionDays} disabled={disabled} onChange={(e) => set("defaultResolutionDays", Number(e.target.value))} />
      </Card>

      <Card id="researcher-defaults" title="Researcher defaults" description="What researchers can expect from your programs by default.">
        <div className="sm:col-span-2 space-y-1">
          <Switch label="Safe harbor for good-faith research" checked={form.defaultSafeHarbor} onChange={(v) => canEdit && set("defaultSafeHarbor", v)} />
          <Switch label="Thank researchers in the Hall of Fame" checked={form.defaultHallOfFame} onChange={(v) => canEdit && set("defaultHallOfFame", v)} />
        </div>
        <Input type="number" min={0} max={365} label="Disclosure timeline (days)" helperText="How long after a fix before a report may be disclosed." value={form.defaultDisclosureDays} disabled={disabled} onChange={(e) => set("defaultDisclosureDays", Number(e.target.value))} />
      </Card>

      {(dirty || error || notice) && (
        <div role="status" className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
          <p className={`text-sm font-medium ${error ? "text-danger" : "text-ink"}`}>{error ?? (dirty ? "You have unsaved changes." : notice)}</p>
          {dirty && canEdit && (
            <div className="flex gap-2">
              <Button variant="secondary" disabled={pending} onClick={() => { setForm(saved); setError(null); }}>Discard</Button>
              <Button pending={pending} onClick={save}>Save changes</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
