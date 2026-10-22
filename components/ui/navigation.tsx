"use client";

import React, { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { popoverMotion } from "./popover-motion";

// Aligned to the exact same recipe as components/ui/tabs.tsx's URL-driven Tabs (shrink-0,
// border-b-2, px-3 py-3, text-sm font-semibold, the identical active/hover/glow classes)
// so the two tab implementations in this codebase render pixel-identical instead of
// silently disagreeing on height and padding -- one used `min-h-11` with no vertical
// padding, the other `py-3` with no min-height, which put their baselines and bottom
// borders at different heights whenever they appeared near each other in a screenshot.
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) { return <div role="tablist" aria-label="Page sections" className="flex items-end gap-1 overflow-x-auto border-b border-border">{tabs.map((tab) => <button key={tab.id} role="tab" aria-selected={active === tab.id} onClick={() => onChange(tab.id)} className={cn("flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 py-3 font-mono text-xs font-bold uppercase tracking-[0.08em] transition-[color,border-color] duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus", active === tab.id ? "border-action text-ink" : "border-transparent text-ink-muted hover:text-ink")}>{tab.label}</button>)}</div>; }

export function Tooltip({ label, children }: { label: string; children: ReactNode }) { return <span className="group relative inline-flex">{children}<span role="tooltip" className="glass-surface-raised pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-52 -translate-x-1/2 rounded px-2 py-1 text-xs text-ink group-hover:block group-focus-within:block">{label}</span></span>; }

// A disclosure (button + aria-expanded/aria-controls + a named group of links), not an
// ARIA menu: its contents are plain links and buttons, and role="menu" promises menuitems
// and arrow-key navigation that a list of links does not have.
export function DropdownMenu({ label, menuLabel = "Menu", children, className, triggerClassName, align = "right" }: { label: ReactNode; menuLabel?: string; children: ReactNode; className?: string; triggerClassName?: string; align?: "left" | "right" }) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  // Same Escape-to-close + return-focus contract as Dialog above -- this menu previously
  // only closed on outside click, leaving keyboard users with no way to dismiss it without
  // tabbing away.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  return <div ref={ref} className={cn("relative inline-block", className)}><button ref={triggerRef} type="button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)} className={cn("min-h-11 rounded-md px-3 text-sm font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus", triggerClassName)}>{label}</button><div id={menuId} role="group" aria-label={menuLabel} aria-hidden={!open} className={cn("glass-surface-raised absolute z-30 mt-1 min-w-44 rounded-md p-1 shadow-xl", align === "left" ? "left-0" : "right-0", popoverMotion(open, align === "left" ? "top-left" : "top-right"))}>{children}</div></div>;
}

export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const titleId = useId();
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
  // max-h-[calc(100vh-2rem)] + overflow-y-auto -- a dialog taller than the viewport (e.g.
  // ImportScopeDialog's preview table with many rows) used to have no way to reach its own
  // footer buttons at all: this section had no height cap, so it simply grew past the
  // bottom of the screen with nothing to scroll. Every dialog in this codebase was short
  // enough to never hit this until the bulk scope import preview did (confirmed live --
  // "Import N entries" sat below the fold with no scrollbar). Fixed at this shared
  // primitive, not with a one-off wrapper in that dialog, since any future tall-content
  // dialog would hit the identical bug.
  // Backdrop now gets its own fade-in (enter-fade, opacity-only) instead of appearing
  // instantly while the panel animates in independently -- previously the two read as
  // disconnected. The panel itself moved from hero-reveal (500ms, 16px translate -- built
  // for a page section, not a popover) to enter-rise (220ms, 4px translate): a modal
  // opened many times a day should confirm instantly, not take half a second to settle.
  //
  // Rendered via createPortal into document.body, not inline where the trigger lives --
  // confirmed live as a real bug otherwise: FinalizeBountyDialog's trigger sits inside the
  // report detail page's `lg:sticky` contextual rail, and a `position: sticky` (or
  // transformed/filtered) ancestor becomes the CONTAINING BLOCK for a `position: fixed`
  // descendant per the CSS spec -- so this dialog's "fixed inset-0" resolved relative to
  // that sticky rail's own box, not the viewport. The backdrop and panel both rendered
  // clipped to the sidebar column's width/height, with the page's other cards showing
  // through where the dimmed backdrop should have been. A portal makes this impossible
  // structurally: the dialog is never a DOM descendant of whatever ancestor its trigger
  // happens to live inside, so no future sticky/transformed/filtered container anywhere in
  // the app can trap it again.
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm motion-safe:animate-enter-fade" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="glass-surface-raised flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col rounded-lg p-5 shadow-2xl motion-safe:animate-enter-rise">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button ref={closeRef} type="button" aria-label="Close dialog" onClick={onClose} className="min-h-11 min-w-11 rounded-md text-xl text-ink-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">×</button>
        </div>
        <div className="mt-4 overflow-y-auto">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) { return <nav aria-label="Breadcrumb"><ol className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">{items.map((item, index) => <li key={item.label} className="flex items-center gap-2">{index > 0 && <span aria-hidden="true">/</span>}{item.href ? <a className="hover:text-ink focus-visible:outline-2 focus-visible:outline-focus" href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}</li>)}</ol></nav>; }

// A deterministic name -> hue, not a fabricated logo (this schema has no logo/branding
// upload) -- the same identity-safe placeholder technique GitHub/Slack/Linear use so
// a real listing of many different organizations doesn't render every avatar in the
// identical flat grey, which is the actual "every card looks the same" complaint
// confirmed against real competitor screenshots. Golden-angle spacing (137.5deg) keeps
// adjacent hash values visually separated even for short/similar names.
function nameToHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(hash * 137.5) % 360;
}

/** `tinted`: derives a per-name background hue instead of the flat neutral default --
 * opt-in, only where distinguishing many different organizations at a glance matters
 * (a public program directory), not the default for every avatar in the app (a team
 * member roster has no such need, and the flat neutral stays correct there). */
export function Avatar({ name, tinted }: { name: string; tinted?: boolean }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  const style = tinted ? { backgroundColor: `hsl(${nameToHue(name)}, 55%, 92%)`, color: `hsl(${nameToHue(name)}, 45%, 32%)` } : undefined;
  return (
    <span role="img" aria-label={`${name} avatar`} style={style} className={cn("inline-flex size-9 items-center justify-center rounded-full text-sm font-semibold", !tinted && "bg-surface-muted text-ink")}>
      {initial}
    </span>
  );
}
