"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, MagnifyingGlass, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cn } from "../lib/cn";

/** One palette row: a destination the sidebar already offers this person, plus its "G then X" key. */
export type CommandItem = { href: Route; label: string; group: string; icon: PhosphorIcon; goKey?: string };

/**
 * The ⌘K / Ctrl K command menu (keyboard-first navigation, Oct 22 shell). Lists only the
 * destinations the sidebar already shows this person (the caller passes them), filtered as
 * you type; the first row searches everything (/search). ↑/↓ move, Enter opens, Esc closes.
 * The input keeps the "Global search" name the old top-bar field had.
 */
export function CommandPalette({ open, items, onClose }: { open: boolean; items: CommandItem[]; onClose: () => void }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = term ? items.filter((item) => item.label.toLowerCase().includes(term) || item.group.toLowerCase().includes(term)) : items;
    const search = term ? [{ kind: "search" as const, label: `Search everything for "${query.trim()}"` }] : [];
    return [...search, ...matches.map((item) => ({ kind: "go" as const, item }))];
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);
  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  function run(i: number) {
    const row = rows[i];
    if (!row) return;
    onClose();
    if (row.kind === "search") window.location.href = `/search?q=${encodeURIComponent(query.trim())}`;
    else router.push(row.item.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") return onClose();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setIndex((was) => (rows.length ? (was + step + rows.length) % rows.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(index);
    }
  }

  let lastGroup = "";
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-[12vh] motion-safe:animate-enter-fade" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Command menu" className="glass-surface-raised w-full max-w-xl overflow-hidden rounded-xl shadow-2xl motion-safe:animate-enter-rise">
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <MagnifyingGlass aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Global search"
            aria-controls={listId}
            aria-activedescendant={rows[index] ? `${listId}-${index}` : undefined}
            placeholder="Type a command or search…"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none focus-visible:!outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">Esc</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Commands" className="max-h-[min(24rem,60vh)] overflow-y-auto p-1.5">
          {rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">Nothing matches. Press Enter on a search instead.</li>}
          {rows.map((row, i) => {
            const group = row.kind === "search" ? "Search" : row.item.group;
            const heading = group !== lastGroup ? group : null;
            lastGroup = group;
            const Icon = row.kind === "search" ? MagnifyingGlass : row.item.icon;
            return (
              <React.Fragment key={row.kind === "search" ? "search" : `${row.item.href}-${row.item.label}`}>
                {heading && <li role="presentation" className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium text-ink-muted">{heading}</li>}
                <li
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === index}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => run(i)}
                  className={cn("flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] text-ink", i === index && "bg-surface-muted")}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">{row.kind === "search" ? row.label : row.item.label}</span>
                  {row.kind === "go" && row.item.goKey && (
                    <span className="flex shrink-0 gap-1" aria-label={`Shortcut G then ${row.item.goKey}`}>
                      <kbd className="rounded border border-border px-1 font-mono text-[10px] text-ink-muted">G</kbd>
                      <kbd className="rounded border border-border px-1 font-mono text-[10px] text-ink-muted">{row.item.goKey}</kbd>
                    </span>
                  )}
                  {i === index && <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted" />}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-ink-muted">
          <span><kbd className="font-mono">↑↓</kbd> move</span>
          <span><kbd className="font-mono">Enter</kbd> open</span>
          <span><kbd className="font-mono">G</kbd> then a letter jumps anywhere</span>
          <span className="ml-auto"><kbd className="font-mono">?</kbd> all shortcuts</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** "?" opens this: every keyboard shortcut in the app shell. */
export function ShortcutSheet({ open, items, onClose }: { open: boolean; items: CommandItem[]; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const general: [string, string][] = [["⌘K / Ctrl K", "Command menu"], ["[", "Collapse or expand the sidebar"], ["?", "This list"], ["Esc", "Close a menu or dialog"]];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-[12vh] motion-safe:animate-enter-fade" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="glass-surface-raised w-full max-w-md rounded-xl p-5 shadow-2xl motion-safe:animate-enter-rise">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Keyboard shortcuts</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted">Close</button>
        </div>
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-[13px]">
          {general.map(([keys, what]) => (
            <React.Fragment key={keys}>
              <dt className="text-ink">{what}</dt>
              <dd className="font-mono text-xs text-ink-muted">{keys}</dd>
            </React.Fragment>
          ))}
          {items.filter((item) => item.goKey).map((item) => (
            <React.Fragment key={`${item.href}-${item.label}`}>
              <dt className="text-ink">Go to {item.label}</dt>
              <dd className="font-mono text-xs text-ink-muted">G {item.goKey}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  );
}
