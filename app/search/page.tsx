import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { SectionLabel } from "../../components/ui/security-primitives";
import { EmptyState } from "../../components/ui/feedback";
import { ProgramStatusBadge, StatusBadge } from "../../components/ui/badge";
import { searchEverything } from "../../services/search";
import { getCurrentUser } from "../../lib/auth/current-user";

/**
 * Search across programs, reports and public researcher profiles (search_everything,
 * 202610190001). What appears is decided by the database: an invited private program shows up
 * for the researcher invited to it, a report shows up for the people who can open it, and a
 * researcher only if their profile is public. Plain GET form, so it works without JavaScript
 * and the query lives in the URL (shareable, back button works).
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 100);
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=${encodeURIComponent(`/search?q=${query}`)}` as Route);

  const results = await searchEverything(query);
  const total = results.programs.length + results.reports.length + results.researchers.length;

  return (
    <AppShell title="Search" user={user}>
      <div className="mx-auto max-w-3xl space-y-6">
        <form action="/search" method="get" role="search" className="flex gap-2">
          <label htmlFor="search-q" className="sr-only">
            Search programs, reports and researchers
          </label>
          <input
            id="search-q"
            name="q"
            type="search"
            defaultValue={query}
            maxLength={100}
            placeholder="Search programs, reports and researchers"
            className="min-h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
          />
          <button type="submit" className="min-h-11 shrink-0 rounded-md bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover">
            Search
          </button>
        </form>

        {query.length < 2 ? (
          <p className="text-sm text-ink-muted">Type at least two characters. You can find programs you can open (including private ones you were invited to), reports you can see, and researchers with public profiles.</p>
        ) : total === 0 ? (
          <EmptyState title="No results">Nothing you can open matches &ldquo;{query}&rdquo;. Try a shorter or different term.</EmptyState>
        ) : (
          <>
            {results.programs.length > 0 && (
              <section className="space-y-2">
                <SectionLabel>Programs</SectionLabel>
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                  {results.programs.map((p) => (
                    <li key={p.id}>
                      <Link prefetch={false} href={`/organizations/${p.organizationId}/programs/${p.id}` as Route} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-hover">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{p.name}</span>
                          <span className="block truncate text-xs text-ink-muted">{p.organizationName}</span>
                        </span>
                        <ProgramStatusBadge status={p.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {results.reports.length > 0 && (
              <section className="space-y-2">
                <SectionLabel>Reports</SectionLabel>
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                  {results.reports.map((r) => (
                    <li key={r.id}>
                      <Link prefetch={false} href={`/organizations/${r.organizationId}/programs/${r.programId}/reports/${r.id}` as Route} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-hover">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{r.title}</span>
                          <span className="block truncate text-xs text-ink-muted">{r.programName}</span>
                        </span>
                        <StatusBadge status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {results.researchers.length > 0 && (
              <section className="space-y-2">
                <SectionLabel>Researchers</SectionLabel>
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                  {results.researchers.map((r) => (
                    <li key={r.id}>
                      <Link prefetch={false} href={`/researchers/${encodeURIComponent(r.username)}` as Route} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-hover">
                        <span className="min-w-0 truncate font-medium text-ink">{r.displayName}</span>
                        <span className="shrink-0 font-mono text-xs text-ink-muted">@{r.username}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
