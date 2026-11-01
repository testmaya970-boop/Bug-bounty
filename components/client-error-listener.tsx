"use client";

import { useEffect } from "react";
import { reportClientError } from "../lib/report-client-error";

/** Catches what React error boundaries can't: errors in event handlers, timers, and
 * unhandled promise rejections. Renders nothing. Mounted once in app/layout.tsx. */
export function ClientErrorListener() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportClientError(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => reportClientError(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
