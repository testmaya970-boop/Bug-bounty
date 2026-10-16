"use client";

import React from "react";
import { ErrorScreen } from "../components/ui/error-screen";

/** Root error boundary: any rendering error below the root layout without a closer boundary
 * lands here instead of Next.js's bare default screen. Server-side errors are already recorded
 * by instrumentation.ts; `digest` links this report to that one. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} backHref="/" backLabel="Back to dashboard" />;
}
