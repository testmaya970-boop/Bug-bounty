"use client";

import React from "react";
import { ErrorScreen } from "../../components/ui/error-screen";

export default function SegmentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} backHref="/platform" backLabel="Back to the platform overview" />;
}
