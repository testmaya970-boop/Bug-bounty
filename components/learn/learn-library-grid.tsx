"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { CtfCategoryBadge } from "../ui/badge";
import { cn } from "../../lib/cn";
import { TRAINING_ARTICLES, type TrainingArticle } from "../../lib/training/content";
import { MOCK_CTF_CATEGORIES, type CtfCategoryId } from "../../lib/mock/ctf";

/** Owns category/search filter state -- local, client-side over the fully-loaded,
 * small, static article set (15 articles), mirroring how components/ctf/challenge-grid.tsx
 * is the one client boundary while its parent page stays a Server Component. */
export function LearnLibraryGrid({ articles }: { articles: TrainingArticle[] }) {
  const [categoryFilter, setCategoryFilter] = useState<CtfCategoryId | "">("");
  const [search, setSearch] = useState("");

  const categoryLabel = new Map(MOCK_CTF_CATEGORIES.map((category) => [category.id, category.label]));

  const visibleArticles = useMemo(() => {
    let filtered = articles;
    if (categoryFilter) filtered = filtered.filter((article) => article.categoryId === categoryFilter);
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      filtered = filtered.filter((article) => article.title.toLowerCase().includes(term) || article.summary.toLowerCase().includes(term));
    }
    return filtered;
  }, [articles, categoryFilter, search]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="learn-search">
          Search lessons
        </label>
        <input
          id="learn-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search lessons"
          className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30 sm:max-w-64"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter("")}
            aria-pressed={categoryFilter === ""}
            className={cn(
              "min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              categoryFilter === "" ? "border-action bg-action/10 text-action" : "border-border text-ink-muted hover:text-ink",
            )}
          >
            All categories
          </button>
          {MOCK_CTF_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryFilter(category.id)}
              aria-pressed={categoryFilter === category.id}
              className={cn(
                "min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                categoryFilter === category.id ? "border-action bg-action/10 text-action" : "border-border text-ink-muted hover:text-ink",
              )}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 font-mono text-xs text-ink-muted">
        {visibleArticles.length} of {TRAINING_ARTICLES.length} lessons
      </p>

      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleArticles.map((article) => (
          <Link prefetch={false}
            key={article.id}
            href={`/learn/${article.slug}` as Route}
            className="rounded-lg border border-border bg-surface p-4 transition-colors duration-150 hover:bg-surface-muted motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <CtfCategoryBadge categoryId={article.categoryId} label={categoryLabel.get(article.categoryId) ?? article.categoryId} />
            <p className="mt-2 text-sm font-semibold text-ink">{article.title}</p>
            <p className="mt-1 text-xs text-ink-muted">{article.summary}</p>
            <p className="mt-2 font-mono text-[11px] text-ink-muted">{article.estimatedMinutes} min read</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
