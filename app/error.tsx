"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { Button } from "../components/ui/button";
import { reportClientError } from "../lib/report-client-error";

/** Root error boundary: any rendering error below the root layout lands here instead of
 * Next.js's bare default screen, and is reported to /platform/errors. Server-side errors
 * are already recorded by instrumentation.ts; `digest` links this report to that one. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, error.digest);
  }, [error]);

  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-6 py-16">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-danger">Something went wrong</p>
      <h1 className="text-2xl font-bold tracking-tight text-ink">This page hit an unexpected error.</h1>
      <p className="text-sm text-ink-muted">
        It has been reported automatically. Try again, or head back to your dashboard. Nothing you submitted before this point was lost.
      </p>
      {error.digest && <p className="font-mono text-xs text-ink-muted">Reference: {error.digest}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link prefetch={false} href="/" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-action hover:underline">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
