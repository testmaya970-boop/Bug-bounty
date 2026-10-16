"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Button } from "./button";
import { reportClientError } from "../../lib/report-client-error";

/** The one error screen every route segment's error.tsx renders, so a failure looks and
 * behaves the same everywhere: reported to /platform/errors, a reference to quote, a retry
 * that re-fetches (Next 16.3 `retry`, not `reset`, which re-renders the same failed payload),
 * and a way back that fits where the person was. */
export function ErrorScreen({ error, retry, backHref, backLabel }: { error: Error & { digest?: string }; retry: () => void; backHref: string; backLabel: string }) {
  useEffect(() => {
    reportClientError(error, error.digest);
  }, [error]);

  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-6 py-16">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-danger">Something went wrong</p>
      <h1 className="text-2xl font-bold tracking-tight text-ink">This page hit an unexpected error.</h1>
      <p className="text-sm text-ink-muted">It has been reported automatically. Try again, or go back. Nothing you submitted before this point was lost.</p>
      {error.digest && <p className="font-mono text-xs text-ink-muted">Reference: {error.digest}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={retry}>Try again</Button>
        <Link prefetch={false} href={backHref as Route} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-action hover:underline">
          {backLabel}
        </Link>
      </div>
    </main>
  );
}
