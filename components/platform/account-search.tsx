"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { searchAccountsAction } from "../../actions/platform-operations";
import type { AdminAccountMatch } from "../../services/platform-operations";

/**
 * Search-as-you-type researcher picker for the platform-admin forms: type part of a
 * username, name or email, pick from the dropdown (mouse or keyboard), and the form acts on
 * exactly that account -- no more typing a username from memory. ARIA 1.2 combobox:
 * arrow keys move, Enter picks, Escape closes.
 */
export function AccountSearch({
  label,
  selected,
  onSelect,
  onlyDeactivated = false,
  error,
}: {
  label: string;
  selected: AdminAccountMatch | null;
  onSelect: (account: AdminAccountMatch | null) => void;
  onlyDeactivated?: boolean;
  error?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminAccountMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await searchAccountsAction({ query: q, onlyDeactivated });
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setSearchError(result.message);
        setResults([]);
        return;
      }
      setSearchError(null);
      setResults(result.data);
      setActive(0);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, onlyDeactivated]);

  function pick(account: AdminAccountMatch) {
    onSelect(account);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && open && results[active]) {
      event.preventDefault(); // pick, don't submit the form
      pick(results[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  if (selected) {
    return (
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">{label}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-strong bg-surface-muted px-3 py-2">
          <AccountSummary account={selected} />
          <Button
            type="button"
            variant="quiet"
            onClick={() => {
              onSelect(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            Change
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-1 text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const showList = open && query.trim().length >= 2;
  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        <span aria-hidden="true"> *</span>
      </label>
      <input
        ref={inputRef}
        id={id}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${results[active].id}` : undefined}
        aria-invalid={Boolean(error)}
        autoComplete="off"
        placeholder="Search by username, name or email"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
      />
      <p className="mt-1 text-xs text-ink-muted">Type at least 2 characters.</p>
      {showList && (
        <ul id={listId} role="listbox" aria-label={`${label} results`} className="absolute inset-x-0 top-[4.75rem] z-20 max-h-80 overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg">
          {loading && <li className="px-3 py-2 text-sm text-ink-muted">Searching…</li>}
          {!loading && searchError && <li className="px-3 py-2 text-sm text-danger">{searchError}</li>}
          {!loading && !searchError && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-muted">
              No {onlyDeactivated ? "deactivated researcher" : "researcher"} matches &ldquo;{query.trim()}&rdquo;. Try part of their username, name or email.
            </li>
          )}
          {!loading &&
            results.map((account, index) => (
              <li
                key={account.id}
                id={`${listId}-${account.id}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()} // keep focus so the click lands
                onClick={() => pick(account)}
                onMouseEnter={() => setActive(index)}
                className={`cursor-pointer px-3 py-2 ${index === active ? "bg-surface-muted" : ""}`}
              >
                <AccountSummary account={account} />
              </li>
            ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function AccountSummary({ account }: { account: AdminAccountMatch }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
        <span className="truncate">{account.displayName}</span>
        {account.deactivatedAt ? (
          <Badge className="text-ink-muted" dotClassName="bg-ink-muted">Deactivated</Badge>
        ) : account.isSuspended ? (
          <Badge className="text-danger" dotClassName="bg-danger">Suspended</Badge>
        ) : (
          <Badge className="text-success" dotClassName="bg-success">Active</Badge>
        )}
      </p>
      <p className="truncate font-mono text-xs text-ink-muted">
        @{account.username}
        {account.email ? ` · ${account.email}` : ""}
      </p>
    </div>
  );
}
