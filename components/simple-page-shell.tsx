import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ShieldCheck } from "lucide-react";
import { signOutAction } from "../actions/auth";

type ShellUser = { id: string; displayName: string; email: string | null };

/**
 * A plain, chrome-free layout for legal/help/policy content -- Safe Harbor, Help, and any
 * future page whose job is "a document a signed-in user reads," not "a workspace they
 * operate in." AppShell's own full sidebar (Research/Practice/Record/System nav groups,
 * organization switcher) is real operational navigation, correct for every other
 * authenticated page -- but wrapping a legal policy page in the identical chrome as the
 * researcher dashboard made the two visually indistinguishable except for their content,
 * which read as "generic dashboard wrapper," not "this is a distinct, considered document."
 *
 * Deliberately NOT a variant of AppShellClient reusing its internals (GlobalSearch,
 * NotificationBell, the org switcher) -- those are real operational tools tied to the
 * workspace this page is explicitly not trying to be. A simple top bar (brand + a real
 * way back to the workspace + sign out) is everything a document page actually needs.
 */
export function SimplePageShell({ title, children, user }: { title: string; children: React.ReactNode; user?: ShellUser | null }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:outline-2 focus:outline-focus">
        Skip to content
      </a>
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href={(user ? "/" : "/sign-in") as Route} prefetch={false} className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            <ShieldCheck aria-hidden="true" className="size-5 text-action" />
            <span className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight">Unpatched</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-ink-muted">
            <Link href={"/" as Route} prefetch={false} className="hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              {user ? "Back to workspace" : "Sign in"}
            </Link>
            {user && (
              <form action={signOutAction}>
                <button type="submit" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  Sign out
                </button>
              </form>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
