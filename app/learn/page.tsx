import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { Breadcrumbs } from "../../components/ui/navigation";
import { SectionLabel } from "../../components/ui/security-primitives";
import { LearnLibraryGrid } from "../../components/learn/learn-library-grid";
import { getCurrentUser } from "../../lib/auth/current-user";
import { TRAINING_ARTICLES } from "../../lib/training/content";

/**
 * The training content library index (docs/decisions/0066) -- free, real, authored
 * lesson articles closing the "no Hacker101/Bugcrowd-University equivalent" gap.
 * Auth-gated exactly like /ctf; filtering lives in a dedicated client component
 * (components/learn/learn-library-grid.tsx) over this static, fully-loaded article set.
 */
export default async function LearnPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/learn" as Route);

  return (
    <AppShell title="Learn" user={user}>
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Learn" }]} />

        <div>
          <SectionLabel>Training</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Free lessons on real vulnerability classes and how to find them. Read one, then try the matching challenge in CTF.</p>
        </div>

        <LearnLibraryGrid articles={TRAINING_ARTICLES} />
      </div>
    </AppShell>
  );
}
