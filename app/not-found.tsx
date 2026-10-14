import React from "react";
import Link from "next/link";
import type { Metadata, Route } from "next";
import { SimplePageShell } from "../components/simple-page-shell";

export const metadata: Metadata = { title: "Page not found | Unpatched" };

/** Every unknown route, malformed id and hidden page (e.g. /platform for a non-admin) lands
 * here -- the same answer for "doesn't exist" and "not yours", so neither is revealed. */
export default function NotFound() {
  return (
    <SimplePageShell title="Page not found">
      <p className="text-sm text-ink-muted">This page doesn&apos;t exist, or you don&apos;t have access to it. Check the address, or head back and try again.</p>
      <div className="mt-6 flex flex-wrap gap-3 text-sm font-medium">
        <Link href={"/" as Route} prefetch={false} className="rounded-md bg-action px-4 py-2 text-on-action hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Go to Unpatched home
        </Link>
        <Link href={"/programs" as Route} prefetch={false} className="rounded-md border border-border px-4 py-2 text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Browse programs
        </Link>
      </div>
    </SimplePageShell>
  );
}
