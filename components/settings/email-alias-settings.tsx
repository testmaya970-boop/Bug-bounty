"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { LocalTime } from "../ui/local-time";
import { createMyEmailAliasAction } from "../../actions/email-alias";
import type { MyEmailAlias } from "../../services/email-alias";

const STATUS_LABEL: Record<string, string> = {
  forwarded: "Forwarded",
  received: "Forwarding",
  failed: "Failed",
  rate_limited: "Not forwarded (daily limit)",
  rejected_inactive: "Not forwarded (account inactive)",
  rejected_unknown_alias: "Not forwarded",
};

export function EmailAliasSettings({ alias }: { alias: MyEmailAlias }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!alias.enabled) {
    return <p className="rounded-lg border border-dashed border-border p-4 text-sm text-ink-muted">Email aliases aren&apos;t available yet. They&apos;ll appear here once the platform enables them.</p>;
  }

  if (!alias.address) {
    return (
      <div className="space-y-3">
        <Button
          pending={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await createMyEmailAliasAction();
              if (!result.ok) setError(result.message);
              else router.refresh();
            })
          }
        >
          Create my email alias
        </Button>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
        <span className="font-mono text-base font-semibold text-ink" data-testid="email-alias-address">
          {alias.address}
        </span>
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(alias.address!).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-ink">Recent mail</h2>
        {alias.recentForwards.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nothing has been sent to your alias yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {alias.recentForwards.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
                <span className="min-w-0 truncate text-ink">
                  {f.subject || "(no subject)"} <span className="text-ink-muted">· from {f.sender}</span>
                </span>
                <span className="text-xs text-ink-muted">
                  {STATUS_LABEL[f.status] ?? f.status} · <LocalTime value={f.receivedAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
