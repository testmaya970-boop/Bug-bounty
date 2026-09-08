"use client";

import React, { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";

// Aligned to the exact same recipe as components/ui/tabs.tsx's URL-driven Tabs (shrink-0,
// border-b-2, px-3 py-3, text-sm font-semibold, the identical active/hover/glow classes)
// so the two tab implementations in this codebase render pixel-identical instead of
// silently disagreeing on height and padding -- one used `min-h-11` with no vertical
// padding, the other `py-3` with no min-height, which put their baselines and bottom
// borders at different heights whenever they appeared near each other in a screenshot.
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) { return <div role="tablist" aria-label="Page sections" className="flex items-end gap-1 overflow-x-auto border-b border-border">{tabs.map((tab) => <button key={tab.id} role="tab" aria-selected={active === tab.id} onClick={() => onChange(tab.id)} className={cn("flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition-[color,border-color,box-shadow] duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus", active === tab.id ? "border-action text-ink shadow-[0_1px_8px_var(--glow-action)]" : "border-transparent text-ink-muted hover:text-ink")}>{tab.label}</button>)}</div>; }

export function Tooltip({ label, children }: { label: string; children: ReactNode }) { return <span className="group relative inline-flex">{children}<span role="tooltip" className="glass-surface-raised pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-52 -translate-x-1/2 rounded px-2 py-1 text-xs text-ink group-hover:block group-focus-within:block">{label}</span></span>; }

export function DropdownMenu({ label, children }: { label: ReactNode; children: ReactNode }) { const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); useEffect(() => { const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []); return <div ref={ref} className="relative inline-block"><button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 rounded-md px-3 text-sm font-medium text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{label}</button>{open && <div role="menu" className="glass-surface-raised motion-safe:animate-enter-rise absolute right-0 z-30 mt-1 min-w-44 rounded-md p-1 shadow-xl">{children}</div>}</div>; }

export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  // Callers pass an inline onClose (e.g. CreateOrganizationDialog's `close`), a new
  // function identity on every render of that parent -- including every keystroke into a
  // field whose state the parent owns. Reading the latest onClose through a ref, rather
  // than closing over the prop directly, keeps that identity churn out of the effect's own
  // dependency array below, which previously re-ran (re-stealing focus to the close
  // button) on every keystroke because `onClose` was listed as a dependency there.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, [open]);
  if (!open) return null; return <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="glass-surface-raised w-full max-w-md rounded-lg p-5 shadow-2xl motion-safe:animate-hero-reveal"><div className="flex items-start justify-between gap-4"><h2 id="dialog-title" className="text-lg font-semibold">{title}</h2><button ref={closeRef} type="button" aria-label="Close dialog" onClick={onClose} className="min-h-11 min-w-11 rounded-md text-xl text-ink-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">×</button></div><div className="mt-4">{children}</div></section></div>; }

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) { return <nav aria-label="Breadcrumb"><ol className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">{items.map((item, index) => <li key={item.label} className="flex items-center gap-2">{index > 0 && <span aria-hidden="true">/</span>}{item.href ? <a className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus" href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}</li>)}</ol></nav>; }

export function Avatar({ name }: { name: string }) { const initial = name.trim().slice(0, 1).toUpperCase() || "?"; return <span role="img" aria-label={`${name} avatar`} className="inline-flex size-9 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-ink">{initial}</span>; }
