import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { Breadcrumbs } from "../../../components/ui/navigation";
import { Card, PermissionDenied } from "../../../components/ui/feedback";
import { SectionLabel, MetadataPair } from "../../../components/ui/security-primitives";
import { CtfCategoryBadge } from "../../../components/ui/badge";
import { TrainingArticleBody } from "../../../components/learn/training-article-body";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { getTrainingArticleBySlug } from "../../../lib/training/content";
import { MOCK_CTF_CATEGORY_META } from "../../../lib/mock/ctf";
import { formatDate } from "../../../lib/format-date";

/**
 * One training article's reading view (docs/decisions/0066) -- two-column layout
 * matching the CTF challenge detail page's own pattern (main reading column + a sticky
 * metadata rail). An unknown slug renders the same unified "does not exist" state that
 * page uses for its own null case.
 */
export default async function TrainingArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/learn/${slug}` as Route);

  const article = getTrainingArticleBySlug(slug);

  if (!article) {
    return (
      <AppShell title="Learn" user={user}>
        <PermissionDenied>This lesson does not exist.</PermissionDenied>
      </AppShell>
    );
  }

  const categoryLabel = MOCK_CTF_CATEGORY_META[article.categoryId].label;

  return (
    <AppShell title="Learn" user={user}>
      <div className="max-w-5xl">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Learn", href: "/learn" }, { label: article.title }]} />

        <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-8">
          <div className="min-w-0">
            <SectionLabel>Lesson</SectionLabel>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{article.title}</h2>
            <p className="mt-2 text-sm text-ink-muted">{article.summary}</p>

            <div className="mt-6">
              <TrainingArticleBody sections={article.sections} />
            </div>
          </div>

          <div className="mt-6 lg:mt-0 lg:sticky lg:top-24 lg:self-start">
            <Card className="space-y-4 p-4">
              <div>
                <SectionLabel>Category</SectionLabel>
                <div className="mt-1.5">
                  <CtfCategoryBadge categoryId={article.categoryId} label={categoryLabel} />
                </div>
              </div>
              <MetadataPair label="Estimated time" value={`${article.estimatedMinutes} min`} />
              <MetadataPair label="Published" value={formatDate(article.publishedAt)} />
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
