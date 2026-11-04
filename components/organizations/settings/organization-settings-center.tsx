"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Archive, BarChart3, Bell, Building2, CheckCircle2, ChevronRight, Clock, Code2, Database, Download, Globe2, Lightbulb,
  RotateCcw, ShieldCheck, SlidersHorizontal, Trash2, Upload, UserRoundCog, Users, type LucideIcon,
} from "lucide-react";
import { Dialog } from "../../ui/navigation";
import { Input, Select, Switch } from "../../ui/form";
import { Button } from "../../ui/button";
import { OrgLogo } from "../../ui/org-logo";
import { updateOrganizationSettingsAction } from "../../../actions/organizations";
import { DATE_FORMATS, DEFAULT_ORGANIZATION_SETTINGS, LANGUAGES, WEEKDAYS, organizationSettingsSchema, type OrganizationSettings } from "../../../lib/organization-settings";

const TIME_ZONES = ["UTC", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"];
const COUNTRY_NAMES = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();

export type SettingsCenterProps = {
  organizationId: string;
  name: string;
  slug: string;
  logoVersion?: string;
  ownerName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  plan: string | null;
  stats: { programs: number; researchers: number | null; activePercent: number | null };
  initial: OrganizationSettings;
  canEdit: boolean;
};

type Section = "general" | "regional" | "program" | "researcher" | "notifications" | "features" | "developer" | "data";
type Row = { label: string; value: React.ReactNode };
type Status = "enabled" | "soon" | "beta";

function workingDaysLabel(days: number[]) {
  const sorted = [...days].sort();
  const names = sorted.map((d) => WEEKDAYS.find((w) => w.value === d)?.label ?? "");
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  return contiguous && sorted.length > 2 ? `${names[0]} to ${names[names.length - 1]}` : names.join(", ");
}
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "--");

function StatusText({ status, label }: { status: Status; label?: string }) {
  if (status === "enabled") return <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#027A48]"><span className="size-1.5 shrink-0 rounded-full bg-[#12B76A]" />{label ?? "Enabled"}</span>;
  if (status === "beta") return <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[12px] font-semibold text-[#1D4ED8]">{label ?? "Beta"}</span>;
  return <span className="whitespace-nowrap rounded-md bg-surface-muted px-2 py-0.5 text-[12px] font-medium text-ink-muted">Coming soon</span>;
}

function SummaryCard({ icon: Icon, art: Art, title, description, rows, action, onAction, href }: { icon: LucideIcon; art: LucideIcon; title: string; description: string; rows: Row[]; action: string; onAction?: () => void; href?: string }) {
  const button = "inline-flex h-9 items-center whitespace-nowrap rounded-[10px] border border-border bg-surface px-4 text-[13px] font-semibold text-ink shadow-sm transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
  return (
    <section aria-labelledby={`card-${title}`} className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`card-${title}`} className="flex items-center gap-2.5 text-[17px] font-semibold text-ink"><Icon aria-hidden className="size-5 shrink-0" />{title}</h2>
          <p className="mt-1 text-[13px] text-ink-muted">{description}</p>
        </div>
        {onAction && <button type="button" onClick={onAction} aria-label={`${action}: ${title}`} className="rounded-md p-1 text-ink-muted hover:bg-surface-hover hover:text-ink"><ChevronRight aria-hidden className="size-4" /></button>}
      </div>
      <div className="mt-4 flex flex-1 gap-4">
        <dl className="min-w-0 flex-1 space-y-2.5">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[minmax(0,8.25rem)_minmax(0,1fr)] items-baseline gap-3 text-[13px]">
              <dt className="text-ink">{r.label}</dt>
              <dd className="min-w-0 break-words font-medium text-ink">{r.value}</dd>
            </div>
          ))}
        </dl>
        <div className="hidden shrink-0 flex-col items-center justify-between gap-3 sm:flex">
          <span aria-hidden className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F1F5FB] to-[#E4EBF5] text-[#5B6B88]"><Art className="size-10" strokeWidth={1.5} /></span>
          {href ? <Link prefetch={false} href={href as Route} className={button}>{action}</Link> : <button type="button" onClick={onAction} className={button}>{action}</button>}
        </div>
      </div>
      <div className="mt-4 sm:hidden">
        {href ? <Link prefetch={false} href={href as Route} className={button}>{action}</Link> : <button type="button" onClick={onAction} className={button}>{action}</button>}
      </div>
    </section>
  );
}

function LinkList({ items }: { items: { label: string; detail: string; status?: Status; statusLabel?: string; href?: string }[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((i) => (
        <li key={i.label} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="min-w-0"><span className="block text-sm font-medium text-ink">{i.label}</span><span className="block text-[13px] text-ink-muted">{i.detail}</span></span>
          {i.href ? <Link prefetch={false} href={i.href as Route} className="text-sm font-medium text-action hover:underline">{i.statusLabel ?? "Open"}</Link> : <StatusText status={i.status ?? "soon"} label={i.statusLabel} />}
        </li>
      ))}
    </ul>
  );
}

export function OrganizationSettingsCenter(p: SettingsCenterProps) {
  const router = useRouter();
  const base = `/organizations/${p.organizationId}`;
  const [saved, setSaved] = useState(p.initial);
  const [form, setForm] = useState(p.initial);
  const [open, setOpen] = useState<Section | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const disabled = !p.canEdit || pending;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof OrganizationSettings>(key: K, value: OrganizationSettings[K]) => { setForm((prev) => ({ ...prev, [key]: value })); setNotice(null); setError(null); };
  const check = organizationSettingsSchema.safeParse(form);
  const issue = (key: keyof OrganizationSettings) => (check.success ? undefined : check.error.issues.find((i) => i.path[0] === key)?.message);

  function save() {
    if (!check.success) { setError(check.error.issues[0]?.message ?? "Check the settings."); return; }
    startTransition(async () => {
      const result = await updateOrganizationSettingsAction({ organizationId: p.organizationId, settings: check.data });
      if (!result.ok) { setError(result.message); return; }
      setSaved(check.data);
      setNotice("Settings saved.");
      router.refresh();
    });
  }
  function exportConfiguration() {
    const blob = new Blob([JSON.stringify({ organization: p.name, exportedAt: new Date().toISOString(), settings: saved }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unpatched-settings-${p.slug || "organization"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importConfiguration(file: File) {
    try {
      const json = JSON.parse(await file.text()) as { settings?: object };
      const parsed = organizationSettingsSchema.safeParse({ ...DEFAULT_ORGANIZATION_SETTINGS, ...json.settings });
      if (!parsed.success) { setError(`That file isn't a valid configuration: ${parsed.error.issues[0]?.message}`); return; }
      setForm(parsed.data);
      setNotice("Configuration loaded. Review it, then save.");
    } catch {
      setError("That file isn't a valid configuration.");
    }
  }

  const languageLabel = LANGUAGES.find((l) => l.value === form.defaultLanguage)?.label ?? form.defaultLanguage;
  const countryLabel = form.country ? (COUNTRY_NAMES?.of(form.country) ?? form.country) : "Not set";
  const statusPill = error
    ? { text: error, cls: "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]" }
    : dirty
      ? { text: "Unsaved changes", cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" }
      : { text: notice ?? "All changes saved", cls: "border-[#A6F4C5] bg-[#ECFDF3] text-[#027A48]" };
  const headerBtn = "inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 text-[13px] font-semibold text-ink shadow-sm transition-colors hover:bg-surface-hover disabled:opacity-50";

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <Building2 aria-hidden className="mt-1 size-8 shrink-0 text-ink" strokeWidth={1.6} />
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-ink">Organization Settings</h1>
            <p className="mt-0.5 text-sm text-ink-muted">Configure organization-wide defaults and operational preferences.</p>
          </div>
        </div>
        {p.canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={headerBtn} onClick={exportConfiguration}><Download aria-hidden className="size-4" />Export Config</button>
            <button type="button" className={headerBtn} onClick={() => fileRef.current?.click()}><Upload aria-hidden className="size-4" />Import Config</button>
            <button type="button" className={headerBtn} onClick={() => { setForm(DEFAULT_ORGANIZATION_SETTINGS); setNotice(null); }}><RotateCcw aria-hidden className="size-4" />Reset Defaults</button>
            <button type="button" disabled={!dirty || pending} onClick={save} className="inline-flex h-10 items-center rounded-[10px] bg-[#111827] px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-black disabled:opacity-40">
              {pending ? "Saving..." : "Save Changes"}
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Configuration file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importConfiguration(f); e.target.value = ""; }} />
          </div>
        )}
      </header>

      <section aria-label="Organization" className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] md:block" style={{ background: "radial-gradient(120% 140% at 100% 50%, #0B1220 0%, #1F2937 38%, rgba(31,41,55,0.35) 62%, transparent 80%)" }} />
        <div className="relative flex flex-col gap-4 p-5 md:flex-row md:items-center md:gap-8">
          <div className="flex min-w-0 items-center gap-4">
            <OrgLogo organizationId={p.organizationId} name={p.name} version={p.logoVersion} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink">{p.name}</p>
              <p className="truncate text-[13px] text-ink-muted">{p.slug}</p>
              {p.plan && <span className="mt-1 inline-block rounded-md bg-[#111827] px-2 py-0.5 text-[11px] font-semibold text-white">{p.plan}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3 md:border-l md:border-border md:pl-8">
            <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-ink">{(p.ownerName ?? "?").slice(0, 1).toUpperCase()}</span>
            <div><p className="text-[12px] text-ink-muted">Owned by</p><p className="text-sm font-semibold text-ink">{p.ownerName ?? "--"}</p></div>
          </div>
          <div className="flex items-center gap-3 md:border-l md:border-border md:pl-8">
            <Clock aria-hidden className="size-5 text-ink" />
            <div><p className="text-[12px] text-ink-muted">Last updated</p><p className="text-sm font-semibold text-ink">{p.updatedAt ? `${day(p.updatedAt)}${p.updatedByName ? ` by ${p.updatedByName}` : ""}` : "Never changed"}</p></div>
          </div>
          <span role="status" className={`md:ml-auto inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${statusPill.cls}`}>
            <CheckCircle2 aria-hidden className="size-3.5" />{statusPill.text}
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
          <SummaryCard icon={Building2} art={Building2} title="General" description="Basic organization information and preferences." action={p.canEdit ? "Edit Details" : "View"} onAction={() => setOpen("general")} rows={[
            { label: "Organization Name", value: p.name },
            { label: "Workspace Slug", value: p.slug },
            { label: "Default Language", value: languageLabel },
            { label: "Time Zone", value: form.timeZone },
          ]} />
          <SummaryCard icon={Globe2} art={Building2} title="Regional Settings" description="Country, region and localization settings." action={p.canEdit ? "Edit Settings" : "View"} onAction={() => setOpen("regional")} rows={[
            { label: "Country", value: countryLabel },
            { label: "Currency", value: form.currency },
            { label: "Date Format", value: form.dateFormat },
            { label: "Business Hours", value: `${workingDaysLabel(form.workingDays)}, ${form.businessHoursStart} to ${form.businessHoursEnd}` },
          ]} />
          <SummaryCard icon={ShieldCheck} art={ShieldCheck} title="Program Defaults" description="Set default values for new programs." action="Configure" onAction={() => setOpen("program")} rows={[
            { label: "Default Visibility", value: form.defaultVisibility === "public" ? "Public" : "Private" },
            { label: "Default SLA", value: `${form.defaultFirstResponseHours}h response, ${form.defaultTriageHours}h triage` },
            { label: "Resolution Target", value: `${form.defaultResolutionDays} days` },
            { label: "Reward Currency", value: form.defaultRewardCurrency },
          ]} />
          <SummaryCard icon={Users} art={Users} title="Researcher Defaults" description="Manage default researcher experience." action="Configure" onAction={() => setOpen("researcher")} rows={[
            { label: "Default Safe Harbor", value: form.defaultSafeHarbor ? "In scope" : "Off" },
            { label: "Disclosure Timeline", value: `${form.defaultDisclosureDays} days` },
            { label: "Hall of Fame Visibility", value: form.defaultHallOfFame ? "Public" : "Hidden" },
          ]} />
          <SummaryCard icon={Bell} art={Bell} title="Notifications" description="Who hears about what across the organization." action="Manage" onAction={() => setOpen("notifications")} rows={[
            { label: "Your alerts", value: <StatusText status="enabled" label="Email, in-app" /> },
            { label: "Team channels", value: "Slack, Teams, webhooks" },
            { label: "Digest Frequency", value: <StatusText status="soon" /> },
          ]} />
          <SummaryCard icon={SlidersHorizontal} art={SlidersHorizontal} title="Feature Flags" description="Platform features available to this organization." action="Manage" onAction={() => setOpen("features")} rows={[
            { label: "Private Programs", value: <StatusText status="enabled" /> },
            { label: "AI Features", value: <StatusText status="soon" /> },
            { label: "Managed Triage", value: p.plan ? <StatusText status="enabled" label={p.plan} /> : <span className="text-ink-muted">Not subscribed</span> },
          ]} />
          <SummaryCard icon={Code2} art={Code2} title="API & Developer" description="Manage API and developer preferences." action="Manage" onAction={() => setOpen("developer")} rows={[
            { label: "Webhook Defaults", value: <StatusText status="enabled" label="Signed, retried" /> },
            { label: "Organization API Keys", value: <StatusText status="soon" /> },
          ]} />
          <SummaryCard icon={Database} art={Database} title="Data Management" description="Control data retention and export options." action="Manage" onAction={() => setOpen("data")} rows={[
            { label: "Data Export", value: <StatusText status="enabled" label="Available" /> },
            { label: "Retention Policy", value: <StatusText status="soon" /> },
          ]} />
        </div>

        <aside className="min-w-0 space-y-5">
          <section aria-labelledby="overview-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h2 id="overview-heading" className="flex items-center gap-2 text-[16px] font-semibold text-ink"><BarChart3 aria-hidden className="size-5" />Organization Overview</h2>
            <dl className="mt-4 grid grid-cols-3 gap-2 border-b border-border pb-4">
              <div><dd className="text-2xl font-bold text-ink">{p.stats.programs}</dd><dt className="text-[12px] text-ink-muted">Programs</dt></div>
              <div><dd className="text-2xl font-bold text-ink">{p.stats.researchers ?? "--"}</dd><dt className="text-[12px] text-ink-muted">Researchers</dt></div>
              <div><dd className="text-2xl font-bold text-ink">{p.stats.activePercent === null ? "--" : `${p.stats.activePercent}%`}</dd><dt className="text-[12px] text-ink-muted">Live</dt></div>
            </dl>
            <dl className="mt-3 space-y-2.5 text-[13px]">
              <div className="flex justify-between gap-2"><dt className="text-ink-muted">Plan</dt><dd className="font-semibold text-ink">{p.plan ?? "No Managed Triage"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-muted">Created On</dt><dd className="font-semibold text-ink">{day(p.createdAt)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-muted">Region</dt><dd className="font-semibold text-ink">{countryLabel}</dd></div>
            </dl>
            <Link prefetch={false} href={base as Route} className="mt-4 flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-border text-[13px] font-semibold text-ink hover:bg-surface-hover">View Organization Details<ChevronRight aria-hidden className="size-4" /></Link>
          </section>

          <section className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-5">
            <p className="flex items-center gap-2 font-semibold text-ink"><Lightbulb aria-hidden className="size-5 text-[#2563EB]" />Tip</p>
            <p className="mt-2 text-[13px] text-[#344054]">These settings apply across all programs and researchers in your organization. Each program can still override them.</p>
          </section>

          <section aria-labelledby="danger-heading" className="rounded-2xl border border-[#FECDCA] bg-[#FFFBFA] p-5">
            <h2 id="danger-heading" className="flex items-center gap-2 text-[16px] font-semibold text-ink"><AlertTriangle aria-hidden className="size-5 text-[#D92D20]" />Danger Zone</h2>
            <p className="mt-1 text-[13px] text-ink-muted">Irreversible actions for your organization.</p>
            <div className="mt-3 space-y-2">
              <Link prefetch={false} href={`${base}/members` as Route} className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#FDA29B] bg-surface text-[13px] font-semibold text-[#B42318] hover:bg-[#FEF3F2]"><UserRoundCog aria-hidden className="size-4" />Transfer Ownership</Link>
              <button type="button" disabled title="Coming soon" className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-[#FDA29B]/60 bg-surface text-[13px] font-semibold text-[#B42318]/50"><Archive aria-hidden className="size-4" />Archive Organization (coming soon)</button>
              <Link prefetch={false} href={"/contact" as Route} className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#FDA29B] bg-surface text-[13px] font-semibold text-[#B42318] hover:bg-[#FEF3F2]"><Trash2 aria-hidden className="size-4" />Delete Organization</Link>
            </div>
            <p className="mt-3 text-[12px] text-ink-muted">Deleting is done by Unpatched on request, so nothing is lost by accident. An organization always keeps at least one owner.</p>
          </section>
        </aside>
      </div>

      <Dialog open={open === "general"} title="General" onClose={() => setOpen(null)}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Organization name" value={p.name} disabled helperText="Name changes aren't available yet." />
          <Input label="Workspace slug" value={p.slug} disabled />
          <Select label="Default language" value={form.defaultLanguage} disabled={disabled} onChange={(e) => set("defaultLanguage", e.target.value as OrganizationSettings["defaultLanguage"])}>
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </Select>
          <Select label="Time zone" helperText="Used for SLA business hours and scheduled exports." value={form.timeZone} disabled={disabled} onChange={(e) => set("timeZone", e.target.value)}>
            {[...new Set([form.timeZone, ...TIME_ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}
          </Select>
          <div className="sm:col-span-2"><Input type="email" label="Support contact" helperText="Where researchers and Unpatched reach your security team." placeholder="security@yourcompany.com" error={form.supportEmail ? issue("supportEmail") : undefined} value={form.supportEmail} disabled={disabled} onChange={(e) => set("supportEmail", e.target.value)} /></div>
        </div>
        <DialogFooter onDone={() => setOpen(null)} dirty={dirty} />
      </Dialog>

      <Dialog open={open === "regional"} title="Regional Settings" onClose={() => setOpen(null)}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Country" helperText="Two-letter code, for example IN or US." maxLength={2} error={issue("country")} value={form.country} disabled={disabled} onChange={(e) => set("country", e.target.value.toUpperCase())} />
          <Select label="Currency" value={form.currency} disabled={disabled} onChange={(e) => set("currency", e.target.value as "USD" | "INR")}><option value="USD">USD</option><option value="INR">INR</option></Select>
          <Select label="Date format" value={form.dateFormat} disabled={disabled} onChange={(e) => set("dateFormat", e.target.value as OrganizationSettings["dateFormat"])}>{DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}</Select>
          <div />
          <Input type="time" label="Business hours start" value={form.businessHoursStart} disabled={disabled} onChange={(e) => set("businessHoursStart", e.target.value)} />
          <Input type="time" label="Business hours end" error={issue("businessHoursEnd")} value={form.businessHoursEnd} disabled={disabled} onChange={(e) => set("businessHoursEnd", e.target.value)} />
          <fieldset className="min-w-0 sm:col-span-2">
            <legend className="mb-1 block text-[13px] font-medium text-ink">Working days</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = form.workingDays.includes(d.value);
                return <button key={d.value} type="button" aria-pressed={on} disabled={disabled} onClick={() => set("workingDays", on ? form.workingDays.filter((x) => x !== d.value) : [...form.workingDays, d.value].sort())} className={`h-9 min-w-11 rounded-lg border px-2.5 text-[13px] font-medium ${on ? "border-action bg-[#EFF6FF] text-[#1D4ED8]" : "border-border bg-surface text-ink-muted"}`}>{d.label}</button>;
              })}
            </div>
            {issue("workingDays") && <p className="mt-1 text-[12px] text-danger">{issue("workingDays")}</p>}
          </fieldset>
        </div>
        <DialogFooter onDone={() => setOpen(null)} dirty={dirty} />
      </Dialog>

      <Dialog open={open === "program"} title="Program Defaults" onClose={() => setOpen(null)}>
        <p className="mb-4 text-sm text-ink-muted">Every new engagement in the Launch Program Studio starts from these. Each program can still change them.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Default visibility" value={form.defaultVisibility} disabled={disabled} onChange={(e) => set("defaultVisibility", e.target.value as "public" | "private")}><option value="private">Private: invited researchers only</option><option value="public">Public: listed for every researcher</option></Select>
          <Select label="Default reward currency" value={form.defaultRewardCurrency} disabled={disabled} onChange={(e) => set("defaultRewardCurrency", e.target.value as "USD" | "INR")}><option value="USD">USD</option><option value="INR">INR</option></Select>
          <Input type="number" min={1} max={720} label="First response target (hours)" value={form.defaultFirstResponseHours} disabled={disabled} onChange={(e) => set("defaultFirstResponseHours", Number(e.target.value))} />
          <Input type="number" min={1} max={2160} label="Triage target (hours)" error={issue("defaultTriageHours")} value={form.defaultTriageHours} disabled={disabled} onChange={(e) => set("defaultTriageHours", Number(e.target.value))} />
          <Input type="number" min={1} max={365} label="Resolution target (days)" helperText="Time to fix a confirmed vulnerability." value={form.defaultResolutionDays} disabled={disabled} onChange={(e) => set("defaultResolutionDays", Number(e.target.value))} />
        </div>
        <DialogFooter onDone={() => setOpen(null)} dirty={dirty} />
      </Dialog>

      <Dialog open={open === "researcher"} title="Researcher Defaults" onClose={() => setOpen(null)}>
        <div className="space-y-3">
          <Switch label="Safe harbor for good-faith research" checked={form.defaultSafeHarbor} onChange={(v) => p.canEdit && set("defaultSafeHarbor", v)} />
          <Switch label="Thank researchers in the Hall of Fame" checked={form.defaultHallOfFame} onChange={(v) => p.canEdit && set("defaultHallOfFame", v)} />
          <Input type="number" min={0} max={365} label="Disclosure timeline (days)" helperText="How long after a fix before a report may be disclosed." value={form.defaultDisclosureDays} disabled={disabled} onChange={(e) => set("defaultDisclosureDays", Number(e.target.value))} />
        </div>
        <DialogFooter onDone={() => setOpen(null)} dirty={dirty} />
      </Dialog>

      <Dialog open={open === "notifications"} title="Notifications" onClose={() => setOpen(null)}>
        <LinkList items={[
          { label: "Your alerts", detail: "Email and in-app alerts for reports, payments and invitations.", href: "/settings/notifications" },
          { label: "Team channels", detail: "Slack, Teams and webhooks for new reports, critical findings and SLA breaches.", href: `${base}/integrations` },
          { label: "Organization digest", detail: "A weekly summary for every member." },
          { label: "Organization announcements", detail: "Messages from admins to every member." },
        ]} />
      </Dialog>

      <Dialog open={open === "features"} title="Feature Flags" onClose={() => setOpen(null)}>
        <LinkList items={[
          { label: "Private programs", detail: "Invite-only engagements.", status: "enabled" },
          { label: "Public programs", detail: "Listed for every researcher after Unpatched reviews them.", status: "enabled" },
          { label: "Vulnerability disclosure programs", detail: "Programs without bounties.", status: "enabled" },
          { label: "Advanced analytics", detail: "Explorer, CSV, XLSX and PDF exports.", status: "enabled" },
          { label: "Managed Triage", detail: "Unpatched analysts triage your reports.", href: `${base}/managed-triage`, statusLabel: p.plan ? "Active" : "Set up" },
          { label: "AI features", detail: "AI-assisted triage and reporting." },
          { label: "Beta features", detail: "Early access to new capabilities." },
        ]} />
      </Dialog>

      <Dialog open={open === "developer"} title="API & Developer" onClose={() => setOpen(null)}>
        <LinkList items={[
          { label: "Webhook defaults", detail: "Signed event delivery, retried with backoff.", href: `${base}/integrations/webhooks` },
          { label: "Organization API keys", detail: "Keys that act for the organization, not a person." },
          { label: "Allowed origins and rate limits", detail: "Limit where and how often the API is called." },
        ]} />
      </Dialog>

      <Dialog open={open === "data"} title="Data Management" onClose={() => setOpen(null)}>
        <LinkList items={[
          { label: "Export reports and metrics", detail: "CSV, XLSX or PDF, now or on a weekly or monthly schedule.", href: `${base}/analytics` },
          { label: "Retention policy", detail: "Delete closed reports after a set time." },
          { label: "Legal hold", detail: "Keep everything while a matter is open." },
        ]} />
      </Dialog>
    </div>
  );
}

function DialogFooter({ onDone, dirty }: { onDone: () => void; dirty: boolean }) {
  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
      <p className="text-[13px] text-ink-muted">{dirty ? "Changes are kept until you press Save Changes." : "No changes yet."}</p>
      <Button onClick={onDone}>Done</Button>
    </div>
  );
}
