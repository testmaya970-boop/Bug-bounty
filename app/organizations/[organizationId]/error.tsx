"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ErrorScreen } from "../../../components/ui/error-screen";

export default function SegmentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const params = useParams<Record<string, string>>();
  return <ErrorScreen error={error} retry={retry} backHref={`/organizations/${params.organizationId}`} backLabel="Back to the organization" />;
}
