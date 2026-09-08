import React from "react";
import Link from "next/link";
import type { Route } from "next";

/**
 * The one first-authentication decision Sentinel actually needs: which real product
 * journey a new visitor is entering, encoded in which link they choose -- never a
 * generic "Sign up" button, and never an interstitial "what's your role?" question
 * after the fact (the route itself already represents the intent). Shared by the public
 * homepage and the neutral /sign-up fallback so the two choices are defined once, not
 * copy-pasted. See docs/decisions/0030-public-entry-and-two-sided-authentication.md.
 */
export function AudienceChoice() {
  return (
    <div className="divide-y divide-border border-y border-border">
      <div className="py-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Researcher</p>
        <p className="mt-2 text-sm text-ink-muted">Find programs, submit vulnerabilities, and build a reputation backed by organization-confirmed outcomes. Never a score.</p>
        <Link
          href={"/researchers/sign-up" as Route}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Continue as researcher <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="py-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Organization</p>
        <p className="mt-2 text-sm text-ink-muted">Run programs, define scope, and triage reports through to a bounty decision, with a real audit trail at every step.</p>
        <Link
          href={"/organizations/sign-up" as Route}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Continue as organization <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
