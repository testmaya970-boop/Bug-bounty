"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive, ArrowDown, ArrowUp, Bank, Buildings, Code, Copy, Cpu, CreditCard, Database, DeviceMobile, DotsSixVertical, DotsThreeVertical,
  Globe, HardDrives, Heartbeat, Key, Lock, MagnifyingGlass, Plus, Robot, Shield, Star, Storefront, type Icon,
} from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Input, Select, Textarea } from "../ui/form";
import { Dialog, DropdownMenu } from "../ui/navigation";
import { formatMoney, minorUnitsToDecimalString, parseDecimalToMinorUnits } from "../../lib/money";
import { REWARD_COLORS, REWARD_ICONS, REWARD_SEVERITIES, REWARD_TEMPLATES } from "../../lib/reward-groups";
import { cn } from "../../lib/cn";
import {
  applyRewardGroupTemplateAction,
  archiveRewardGroupAction,
  deleteRewardGroupAction,
  duplicateRewardGroupAction,
  reorderRewardGroupsAction,
  saveRewardGroupAction,
  setAssetRewardGroupAction,
  setDefaultRewardGroupAction,
} from "../../actions/reward-groups";
import type { RewardColor, RewardGroup, RewardIcon, RewardSeverity } from "../../types/reward-groups";

const ICONS: Record<RewardIcon, Icon> = {
  shield: Shield, server: HardDrives, key: Key, globe: Globe, "device-mobile": DeviceMobile, "credit-card": CreditCard, bank: Bank, cpu: Cpu,
  code: Code, archive: Archive, heartbeat: Heartbeat, buildings: Buildings, storefront: Storefront, robot: Robot, lock: Lock, database: Database,
};

export function RewardGroupBadge({ name, color, icon }: { name: string; color: RewardColor; icon?: RewardIcon }) {
  const I = icon ? ICONS[icon] : null;
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", REWARD_COLORS[color].chip)}>
      {I ? <I aria-hidden="true" weight="bold" className="size-3.5 shrink-0" /> : <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", REWARD_COLORS[color].dot)} />}
      <span className="truncate">{name}</span>
    </span>
  );
}

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const go = (work: () => Promise<{ ok: true } | { ok: false; message: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const r = await work();
      if (!r.ok) return setError(r.message);
      after?.();
      router.refresh();
    });
  return { go, pending, error, setError };
}

const range = (g: RewardGroup, s: RewardSeverity) => g.bounties[s];
const upTo = (g: RewardGroup, s: RewardSeverity) => (range(g, s) ? formatMoney(range(g, s)!.max, g.currency) : "None");

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

type Draft = { name: string; description: string; color: RewardColor; icon: RewardIcon; currency: "INR" | "USD"; amounts: Record<RewardSeverity, { min: string; max: string }> };

function draftFrom(g: RewardGroup | null): Draft {
  const amounts = Object.fromEntries(
    REWARD_SEVERITIES.map((s) => [s.key, { min: g?.bounties[s.key] ? minorUnitsToDecimalString(g.bounties[s.key]!.min) : "", max: g?.bounties[s.key] ? minorUnitsToDecimalString(g.bounties[s.key]!.max) : "" }]),
  ) as Draft["amounts"];
  return { name: g?.name ?? "", description: g?.description ?? "", color: g?.color ?? "blue", icon: g?.icon ?? "shield", currency: g?.currency ?? "USD", amounts };
}

export function RewardGroupEditor({ organizationId, group, open, onClose }: { organizationId: string; group: RewardGroup | null; open: boolean; onClose: () => void }) {
  const [d, setD] = useState<Draft>(() => draftFrom(group));
  const { go, pending, error, setError } = useAction();
  const save = () => {
    const bounties: { severity: RewardSeverity; min: number; max: number }[] = [];
    for (const s of REWARD_SEVERITIES) {
      const a = d.amounts[s.key];
      if (!a.max.trim() && !a.min.trim()) continue;
      const max = parseDecimalToMinorUnits(a.max || "0");
      const min = parseDecimalToMinorUnits(a.min || "0");
      if (max === null || min === null) return setError(`Enter amounts like 5000 or 5000.50 for ${s.label}.`);
      if (max < min) return setError(`For ${s.label}, "up to" must be at least "from".`);
      bounties.push({ severity: s.key, min, max });
    }
    go(() => saveRewardGroupAction(organizationId, group?.id ?? null, { name: d.name, description: d.description, color: d.color, icon: d.icon, currency: d.currency, bounties }), onClose);
  };
  return (
    <Dialog open={open} title={group ? `Edit ${group.name}` : "New reward group"} onClose={onClose}>
      <div className="space-y-4">
        <Input label="Name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={80} placeholder="e.g. Payment Systems" required />
        <Textarea label="Description" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} maxLength={500} rows={2} placeholder="What belongs in this group?" />
        <fieldset>
          <legend className="mb-1 block text-[13px] font-medium text-ink">Color</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(REWARD_COLORS) as RewardColor[]).map((c) => (
              <button key={c} type="button" aria-label={REWARD_COLORS[c].label} aria-pressed={d.color === c} onClick={() => setD({ ...d, color: c })}
                className={cn("size-7 rounded-full ring-offset-2 ring-offset-surface focus-visible:outline-2 focus-visible:outline-focus", REWARD_COLORS[c].dot, d.color === c && "ring-2 ring-ink")} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 block text-[13px] font-medium text-ink">Icon</legend>
          <div className="grid grid-cols-8 gap-1.5">
            {REWARD_ICONS.map((i) => {
              const I = ICONS[i.key];
              return (
                <button key={i.key} type="button" aria-label={i.label} title={i.label} aria-pressed={d.icon === i.key} onClick={() => setD({ ...d, icon: i.key })}
                  className={cn("flex aspect-square items-center justify-center rounded-md border text-ink focus-visible:outline-2 focus-visible:outline-focus", d.icon === i.key ? "border-ink bg-surface-muted" : "border-border hover:bg-surface-muted")}>
                  <I aria-hidden="true" className="size-4" />
                </button>
              );
            })}
          </div>
        </fieldset>
        <div>
          <div className="mb-2 flex items-end justify-between gap-3">
            <p className="text-[13px] font-medium text-ink">Bounty table</p>
            <Select label="Currency" value={d.currency} onChange={(e) => setD({ ...d, currency: e.target.value as "INR" | "USD" })}>
              <option value="USD">USD</option>
              <option value="INR">INR</option>
            </Select>
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="bg-surface-muted text-xs text-ink-muted">
                <tr><th className="px-3 py-2 text-left font-semibold">Severity</th><th className="px-3 py-2 text-left font-semibold">From</th><th className="px-3 py-2 text-left font-semibold">Up to</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {REWARD_SEVERITIES.map((s) => (
                  <tr key={s.key}>
                    <td className="px-3 py-2 text-ink">{s.label}</td>
                    {(["min", "max"] as const).map((k) => (
                      <td key={k} className="px-2 py-1.5">
                        <label className="sr-only" htmlFor={`amt-${s.key}-${k}`}>{s.label} {k === "min" ? "from" : "up to"}</label>
                        <input id={`amt-${s.key}-${k}`} inputMode="decimal" value={d.amounts[s.key][k]} placeholder="0"
                          onChange={(e) => setD({ ...d, amounts: { ...d.amounts, [s.key]: { ...d.amounts[s.key], [k]: e.target.value } } })}
                          className="h-9 w-full min-w-0 rounded-md border border-border bg-surface px-2 font-mono text-sm tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-focus" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">Leave a severity empty to use the program&apos;s own table for it. The organization finalizes the exact amount within the range.</p>
        </div>
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button pending={pending} onClick={save}>{group ? "Save changes" : "Create group"}</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function TemplateChooser({ organizationId, compact = false, onCustom }: { organizationId: string; compact?: boolean; onCustom: () => void }) {
  const [currency, setCurrency] = useState<"INR" | "USD">("USD");
  const { go, pending, error } = useAction();
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Choose a reward group template</p>
          <p className="text-xs text-ink-muted">Creates the groups with a starting bounty table each. Edit anything afterwards.</p>
        </div>
        <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value as "INR" | "USD")}>
          <option value="USD">USD</option>
          <option value="INR">INR</option>
        </Select>
      </div>
      <div className={cn("grid gap-2", compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4")}>
        {REWARD_TEMPLATES.map((t) => (
          <button key={t.key} type="button" disabled={pending}
            onClick={() => { setChosen(t.key); go(() => applyRewardGroupTemplateAction(organizationId, t.key, currency)); }}
            className="rounded-lg border border-border bg-surface p-3 text-left hover:border-ink-muted focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60">
            <span className="block text-sm font-semibold text-ink">{pending && chosen === t.key ? "Creating…" : t.label}</span>
            <span className="mt-1 block text-xs leading-5 text-ink-muted">{t.groups.join(" · ")}</span>
          </button>
        ))}
        <button type="button" onClick={onCustom} className="rounded-lg border border-dashed border-border-strong p-3 text-left hover:border-ink-muted focus-visible:outline-2 focus-visible:outline-focus">
          <span className="block text-sm font-semibold text-ink">Custom</span>
          <span className="mt-1 block text-xs leading-5 text-ink-muted">Start empty and create your own groups.</span>
        </button>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

function GroupCard({ organizationId, g, index, count, canManage, onEdit, onMove, dragProps }: {
  organizationId: string; g: RewardGroup; index: number; count: number; canManage: boolean; onEdit: () => void; onMove: (delta: number) => void;
  dragProps: React.HTMLAttributes<HTMLLIElement> & { draggable?: boolean };
}) {
  const I = ICONS[g.icon];
  const { go, pending, error } = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const item = "block w-full rounded px-3 py-2 text-left text-sm text-ink hover:bg-surface-muted";
  return (
    <li {...dragProps} className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-surface", dragProps.className)}>
      <div className={cn("h-1 rounded-t-xl", REWARD_COLORS[g.color].dot)} aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {canManage && <DotsSixVertical aria-hidden="true" className="mt-1 size-4 shrink-0 cursor-grab text-ink-muted" />}
          <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", REWARD_COLORS[g.color].chip)}>
            <I aria-hidden="true" weight="bold" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold text-ink">
              <span className="truncate">{g.name}</span>
              {g.isDefault && <span className="inline-flex items-center gap-1 rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink-muted"><Star aria-hidden="true" weight="fill" className="size-3" />Default</span>}
            </h3>
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-ink-muted">{g.description ?? "No description."}</p>
          </div>
          {canManage && (
            <DropdownMenu menuLabel={`Actions for ${g.name}`} label={<DotsThreeVertical aria-label={`Actions for ${g.name}`} weight="bold" className="size-4" />} triggerClassName="min-h-8 px-2">
              <div className="w-44 p-1">
                <button type="button" className={item} onClick={onEdit}>Edit</button>
                <button type="button" className={item} onClick={() => go(() => duplicateRewardGroupAction(organizationId, g.id))}>Duplicate</button>
                {!g.isDefault && <button type="button" className={item} onClick={() => go(() => setDefaultRewardGroupAction(organizationId, g.id))}>Make default</button>}
                {!g.isDefault && <button type="button" className={item} onClick={() => go(() => archiveRewardGroupAction(organizationId, g.id, true))}>Archive</button>}
                {!g.isDefault && <button type="button" className={cn(item, "text-danger")} onClick={() => setConfirmDelete(true)}>Delete</button>}
              </div>
            </DropdownMenu>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          <div><dt className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Assets</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{g.assetCount}</dd></div>
          <div><dt className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Critical up to</dt><dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink">{upTo(g, "critical")}</dd></div>
        </dl>
        <p className="text-xs tabular-nums text-ink-muted">High {upTo(g, "high")} · Medium {upTo(g, "medium")} · Low {upTo(g, "low")}</p>
        {canManage && (
          <div className="mt-auto flex items-center gap-1">
            <Button variant="secondary" onClick={onEdit}>Edit</Button>
            <span className="ml-auto" />
            <button type="button" aria-label={`Move ${g.name} up`} disabled={index === 0 || pending} onClick={() => onMove(-1)} className="rounded p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30"><ArrowUp aria-hidden="true" className="size-4" /></button>
            <button type="button" aria-label={`Move ${g.name} down`} disabled={index === count - 1 || pending} onClick={() => onMove(1)} className="rounded p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30"><ArrowDown aria-hidden="true" className="size-4" /></button>
          </div>
        )}
        {confirmDelete && (
          <div className="space-y-2 rounded-md border border-danger/40 bg-surface-muted p-3">
            <p className="text-sm text-ink">Delete {g.name}? Its {g.assetCount} asset{g.assetCount === 1 ? "" : "s"} move to the default group. Bounties already awarded keep their amounts.</p>
            <div className="flex gap-2">
              <Button variant="destructive" pending={pending} onClick={() => go(() => deleteRewardGroupAction(organizationId, g.id))}>Delete group</Button>
              <Button variant="quiet" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
      </div>
    </li>
  );
}

export function RewardGroupsBoard({ organizationId, groups, canManage }: { organizationId: string; groups: RewardGroup[]; canManage: boolean }) {
  const active = useMemo(() => groups.filter((g) => !g.archived), [groups]);
  const archived = groups.filter((g) => g.archived);
  const [order, setOrder] = useState(active.map((g) => g.id));
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<RewardGroup | null | "new">(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const { go, error } = useAction();
  // Server data changed (create, delete, template): resync the local order.
  const key = active.map((g) => g.id).join(",");
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setOrder(active.map((g) => g.id));
  }
  const byId = new Map(active.map((g) => [g.id, g]));
  const ordered = order.map((id) => byId.get(id)).filter((g): g is RewardGroup => Boolean(g));
  const q = query.trim().toLowerCase();
  const visible = q ? ordered.filter((g) => `${g.name} ${g.description ?? ""}`.toLowerCase().includes(q)) : ordered;

  const commit = (next: string[]) => {
    setOrder(next);
    go(() => reorderRewardGroupsAction(organizationId, next));
  };
  const move = (id: string, delta: number) => {
    const i = order.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  if (active.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-dashed border-border-strong p-6 text-center">
          <p className="text-base font-semibold text-ink">No reward groups yet.</p>
          <p className="mt-1 text-sm text-ink-muted">Create your first reward group or start with a template.</p>
          {canManage && <div className="mt-4"><Button onClick={() => setEditing("new")}><Plus aria-hidden="true" className="size-4" />Create group</Button></div>}
        </div>
        {canManage && <TemplateChooser organizationId={organizationId} onCustom={() => setEditing("new")} />}
        {editing && <RewardGroupEditor key="new" organizationId={organizationId} group={null} open onClose={() => setEditing(null)} />}
        <ArchivedList organizationId={organizationId} archived={archived} canManage={canManage} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <MagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-ink-muted" />
          <label className="sr-only" htmlFor="rg-search">Search reward groups</label>
          <input id="rg-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search groups"
            className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus" />
        </div>
        <span className="text-xs text-ink-muted">{active.length} group{active.length === 1 ? "" : "s"}{canManage && " · drag cards or use the arrows to reorder"}</span>
        {canManage && <Button className="ml-auto" onClick={() => setEditing("new")}><Plus aria-hidden="true" className="size-4" />Create group</Button>}
      </div>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      {visible.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-ink-muted">No group matches &ldquo;{query}&rdquo;.</p>
      ) : (
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Reward groups">
          {visible.map((g) => (
            <GroupCard
              key={g.id}
              organizationId={organizationId}
              g={g}
              index={order.indexOf(g.id)}
              count={order.length}
              canManage={canManage}
              onEdit={() => setEditing(g)}
              onMove={(delta) => move(g.id, delta)}
              dragProps={
                canManage && !q
                  ? {
                      draggable: true,
                      onDragStart: (e) => { setDragId(g.id); e.dataTransfer.effectAllowed = "move"; },
                      onDragOver: (e) => { if (dragId && dragId !== g.id) e.preventDefault(); },
                      onDrop: (e) => {
                        e.preventDefault();
                        if (!dragId || dragId === g.id) return;
                        const next = order.filter((id) => id !== dragId);
                        next.splice(next.indexOf(g.id) + (order.indexOf(dragId) < order.indexOf(g.id) ? 1 : 0), 0, dragId);
                        setDragId(null);
                        commit(next);
                      },
                      onDragEnd: () => setDragId(null),
                      className: dragId === g.id ? "opacity-50" : "",
                    }
                  : {}
              }
            />
          ))}
        </ol>
      )}
      {canManage && (
        <details className="rounded-xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink">Add groups from a template</summary>
          <div className="mt-3"><TemplateChooser organizationId={organizationId} compact onCustom={() => setEditing("new")} /></div>
        </details>
      )}
      <ArchivedList organizationId={organizationId} archived={archived} canManage={canManage} />
      {editing && <RewardGroupEditor key={editing === "new" ? "new" : editing.id} organizationId={organizationId} group={editing === "new" ? null : editing} open onClose={() => setEditing(null)} />}
    </div>
  );
}

function ArchivedList({ organizationId, archived, canManage }: { organizationId: string; archived: RewardGroup[]; canManage: boolean }) {
  const { go, error } = useAction();
  if (archived.length === 0) return null;
  return (
    <details className="rounded-xl border border-border bg-surface p-4">
      <summary className="cursor-pointer text-sm font-medium text-ink">Archived groups ({archived.length})</summary>
      <ul className="mt-3 divide-y divide-border">
        {archived.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <RewardGroupBadge name={g.name} color={g.color} icon={g.icon} />
            {canManage && (
              <span className="flex gap-1">
                <Button variant="quiet" onClick={() => go(() => archiveRewardGroupAction(organizationId, g.id, false))}>Restore</Button>
                <Button variant="quiet" onClick={() => go(() => deleteRewardGroupAction(organizationId, g.id))}>Delete</Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-danger">{error}</p>}
    </details>
  );
}

// ---------------------------------------------------------------------------
// Bounty tables matrix
// ---------------------------------------------------------------------------

export function BountyTablesMatrix({ organizationId, groups, canManage }: { organizationId: string; groups: RewardGroup[]; canManage: boolean }) {
  const [editing, setEditing] = useState<RewardGroup | null>(null);
  const active = groups.filter((g) => !g.archived);
  const exportCsv = () => {
    const rows = [["Reward group", "Currency", ...REWARD_SEVERITIES.flatMap((s) => [`${s.label} from`, `${s.label} up to`])]];
    for (const g of active) rows.push([g.name, g.currency, ...REWARD_SEVERITIES.flatMap((s) => (g.bounties[s.key] ? [minorUnitsToDecimalString(g.bounties[s.key]!.min), minorUnitsToDecimalString(g.bounties[s.key]!.max)] : ["", ""]))]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "bounty-tables.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  if (active.length === 0) return <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-ink-muted">No reward groups yet. Create them on the Reward groups page.</p>;
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button variant="secondary" onClick={exportCsv}><Copy aria-hidden="true" className="size-4" />Export CSV</Button></div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="border-b border-border bg-surface-muted text-xs text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-semibold">Reward group</th>
              {REWARD_SEVERITIES.map((s) => <th key={s.key} scope="col" className="px-4 py-3 text-right font-semibold">{s.label}</th>)}
              <th scope="col" className="px-4 py-3 text-right font-semibold">Assets</th>
              {canManage && <th scope="col" className="px-4 py-3"><span className="sr-only">Edit</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {active.map((g) => (
              <tr key={g.id}>
                <td className="px-4 py-3"><RewardGroupBadge name={g.name} color={g.color} icon={g.icon} /> <span className="ml-1 text-xs text-ink-muted">{g.currency}</span></td>
                {REWARD_SEVERITIES.map((s) => {
                  const r = g.bounties[s.key];
                  return (
                    <td key={s.key} className="px-4 py-3 text-right font-mono text-xs tabular-nums text-ink">
                      {r ? (r.min === r.max ? formatMoney(r.max, g.currency) : <>{formatMoney(r.min, g.currency)}<span className="text-ink-muted"> to </span>{formatMoney(r.max, g.currency)}</>) : <span className="text-ink-muted">Program table</span>}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right tabular-nums text-ink-muted">{g.assetCount}</td>
                {canManage && <td className="px-4 py-3 text-right"><Button variant="quiet" onClick={() => setEditing(g)}>Edit</Button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">&ldquo;Program table&rdquo; means that severity has no amount in the group, so the program&apos;s own bounty table applies.</p>
      {editing && <RewardGroupEditor key={editing.id} organizationId={organizationId} group={editing} open onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One asset's group
// ---------------------------------------------------------------------------

export function AssetRewardGroupSelect({ organizationId, assetId, assetName, groupId, groups, canEdit }: {
  organizationId: string; assetId: string; assetName: string; groupId: string | null; groups: { id: string; name: string; color: RewardColor; icon: RewardIcon }[]; canEdit: boolean;
}) {
  const [value, setValue] = useState(groupId ?? "");
  const { go, pending, error } = useAction();
  const current = groups.find((g) => g.id === value);
  if (!canEdit) return current ? <RewardGroupBadge name={current.name} color={current.color} icon={current.icon} /> : <span className="text-sm text-ink-muted">None</span>;
  return (
    <div>
      <label className="sr-only" htmlFor={`rg-${assetId}`}>Reward group for {assetName}</label>
      <select id={`rg-${assetId}`} value={value} disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const previous = value;
          setValue(next);
          go(async () => {
            const r = await setAssetRewardGroupAction(organizationId, assetId, next);
            if (!r.ok) setValue(previous);
            return r;
          });
        }}
        className="min-h-9 max-w-52 rounded-md border border-border bg-surface px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus">
        {!value && <option value="">Choose a group</option>}
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      {error && <p role="alert" className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
