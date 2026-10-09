"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { searchAccountsAction, searchOrganizationsAction } from "../../actions/platform-operations";
import type { AdminAccountMatch, AdminOrganizationMatch } from "../../services/platform-operations";

type SearchResult<T> = { ok: true; data: T[] } | { ok: false; message: string };

/**
 * Search-as-you-type picker for the platform-admin forms: type part of a name, pick from
 * the dropdown (mouse or keyboard), and the form acts on exactly that record -- no more
 * typing a username or slug from memory. ARIA 1.2 combobox: arrow keys move, Enter picks,
 * Escape closes. Researchers and organizations share it (AccountSearch /
 * OrganizationSearch below).
 */
function SearchPicker<T extends { id: string }>({
  label,
  selected,
  onSelect,
  search,
  renderItem,
  placeholder,
  noMatch,
  error,
}: {
  label: string;
  selected: T | null;
  onSelect: (item: T | null) => void;
  search: (query: string) => Promise<SearchResult<T>>;
  renderItem: (item: T) => React.ReactNode;
  placeholder: string;
  noMatch: (query: string) => React.ReactNode;
  error?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef(search);
  searchRef.current = search;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
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
      const result = await searchRef.current(q);
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
  }, [query]);

  function pick(item: T) {
    onSelect(item);
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

  const errorNote = error && (
    <p role="alert" className="mt-1 text-xs font-medium text-danger">
      {error}
    </p>
  );

  if (selected) {
    return (
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">{label}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-strong bg-surface-muted px-3 py-2">
          {renderItem(selected)}
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
        {errorNote}
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
        placeholder={placeholder}
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
          {!loading && !searchError && results.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">{noMatch(query.trim())}</li>}
          {!loading &&
            results.map((item, index) => (
              <li
                key={item.id}
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()} // keep focus so the click lands
                onClick={() => pick(item)}
                onMouseEnter={() => setActive(index)}
                className={`cursor-pointer px-3 py-2 ${index === active ? "bg-surface-muted" : ""}`}
              >
                {renderItem(item)}
              </li>
            ))}
        </ul>
      )}
      {errorNote}
    </div>
  );
}

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
  return (
    <SearchPicker
      label={label}
      selected={selected}
      onSelect={onSelect}
      error={error}
      placeholder="Search by username, name or email"
      search={(query) => searchAccountsAction({ query, onlyDeactivated })}
      renderItem={(account) => <AccountSummary account={account} />}
      noMatch={(query) => (
        <>
          No {onlyDeactivated ? "deactivated researcher" : "researcher"} matches &ldquo;{query}&rdquo;. Try part of their username, name or email.
        </>
      )}
    />
  );
}

export function OrganizationSearch({ label, selected, onSelect, error }: { label: string; selected: AdminOrganizationMatch | null; onSelect: (organization: AdminOrganizationMatch | null) => void; error?: string }) {
  return (
    <SearchPicker
      label={label}
      selected={selected}
      onSelect={onSelect}
      error={error}
      placeholder="Search by name, slug or owner's email"
      search={(query) => searchOrganizationsAction({ query })}
      renderItem={(organization) => <OrganizationSummary organization={organization} />}
      noMatch={(query) => <>No organization matches &ldquo;{query}&rdquo;. Try part of its name, its slug, or the owner&apos;s email.</>}
    />
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

function OrganizationSummary({ organization }: { organization: AdminOrganizationMatch }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
        <span className="truncate">{organization.name}</span>
        {organization.status === "suspended" ? (
          <Badge className="text-danger" dotClassName="bg-danger">Suspended</Badge>
        ) : organization.status === "created" ? (
          <Badge className="text-ink-muted" dotClassName="bg-ink-muted">Setting up</Badge>
        ) : (
          <Badge className="text-success" dotClassName="bg-success">Active</Badge>
        )}
      </p>
      <p className="truncate font-mono text-xs text-ink-muted">
        {organization.slug}
        {organization.ownerEmail ? ` · owner ${organization.ownerEmail}` : ""} · {organization.memberCount} {organization.memberCount === 1 ? "member" : "members"}
      </p>
    </div>
  );
}
