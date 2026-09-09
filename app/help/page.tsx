import React from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { SectionLabel } from "../../components/ui/security-primitives";
import { getCurrentUser } from "../../lib/auth/current-user";

/**
 * Help (Turn 6, phase/9-ia): item 12 of the 15-point nav map, minimal honest size. Real
 * support channel (the one that already exists -- /settings/feedback, see
 * app-shell-client.tsx's own HelpLink comment on why no dedicated support inbox exists
 * yet), a real existing doc (/safe-harbor), and real release notes read live from this
 * repository's own CHANGELOG.md -- never a fabricated support email or an invented docs
 * site. No search, no article library: nothing here promises more than what exists today.
 */
export default async function HelpPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/help" as Route);

  let changelog = "";
  try {
    changelog = await readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf-8");
  } catch {
    changelog = "";
  }
  // A light parse of "## Heading" -> bullet lines, just enough to show the most recent
  // section without re-implementing a markdown renderer for one file. Anything the
  // regex can't parse simply doesn't render here -- the changelog itself, this page's
  // one real source of truth, is still linked in full below.
  const firstSectionMatch = changelog.match(/^## .+\n([\s\S]*?)\n## /m) ?? changelog.match(/^## .+\n([\s\S]*)/m);
  const recentEntries: string[] = [];
  if (firstSectionMatch) {
    // A bullet's wrapped continuation lines (indented, no leading "- ") are joined back
    // onto the bullet they belong to -- otherwise a two-line bullet renders as a
    // truncated first line with its second line silently dropped.
    for (const rawLine of firstSectionMatch[1].split("\n")) {
      const line = rawLine.trim();
      if (line.startsWith("- ")) recentEntries.push(line.slice(2));
      else if (line.length > 0 && recentEntries.length > 0) recentEntries[recentEntries.length - 1] += ` ${line}`;
    }
  }

  return (
    <AppShell title="Help" user={user}>
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <SectionLabel>Support</SectionLabel>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Get help</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Something not working, or have feedback? Use the feedback form -- it goes to the same place a dedicated support inbox would today.
          </p>
          <Link href={"/settings/feedback" as Route} className="mt-3 inline-flex text-sm font-medium text-action hover:text-action-hover">
            Send feedback →
          </Link>
        </div>

        <div className="border-t border-border pt-6">
          <SectionLabel>Documentation</SectionLabel>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Docs</h2>
          <p className="mt-2 text-sm text-ink-muted">A dedicated documentation site doesn't exist yet. What's real today:</p>
          <ul className="mt-3 space-y-2">
            <li>
              <Link href={"/safe-harbor" as Route} className="text-sm font-medium text-action hover:text-action-hover">
                Safe harbor policy →
              </Link>
            </li>
          </ul>
        </div>

        <div className="border-t border-border pt-6">
          <SectionLabel>Release notes</SectionLabel>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">What's new</h2>
          {recentEntries.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Release notes are not available right now.</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
              {recentEntries.map((entry, index) => (
                <li key={index} className="flex gap-2">
                  <span aria-hidden="true">·</span>
                  <span>{entry}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
