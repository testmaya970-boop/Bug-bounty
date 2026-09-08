"use client";

import React, { useState } from "react";
import { Card } from "../ui/feedback";
import { Button } from "../ui/button";
import { SectionLabel } from "../ui/security-primitives";

export function InviteAndEarn({ referralUrl }: { referralUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="p-5">
      <SectionLabel>Invite & earn</SectionLabel>
      <h2 className="mt-1 text-lg font-semibold text-ink">Share your referral link</h2>
      <p className="mt-1 max-w-xl text-sm text-ink-muted">Invite another researcher with your link below. Mock preview only, no reward is actually issued yet.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          readOnly
          value={referralUrl}
          aria-label="Your referral link"
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface-muted px-3 font-mono text-sm text-ink outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
        />
        <Button variant="secondary" onClick={handleCopy}>
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </Card>
  );
}
