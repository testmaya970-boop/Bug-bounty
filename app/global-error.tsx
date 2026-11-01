"use client";

import React, { useEffect } from "react";
import "./globals.css";
import { reportClientError } from "../lib/report-client-error";

/** Last-resort boundary for errors in the root layout itself, where app/error.tsx can't
 * render. Must supply its own <html>/<body>. Plain markup only -- nothing here may depend
 * on the layout (fonts, providers) that just failed. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportClientError(error, error.digest);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body>
        <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Unpatched hit an unexpected error.</h1>
          <p className="text-sm text-ink-muted">It has been reported automatically.</p>
          {error.digest && <p className="font-mono text-xs text-ink-muted">Reference: {error.digest}</p>}
          <button type="button" onClick={retry} className="min-h-11 w-fit rounded-md bg-action px-4 text-sm font-semibold text-on-action">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
