"use client";

import React, { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { Button } from "../ui/button";

/** After an invitation is created: whether the email went out, and the link itself, shown
 * once (only its hash is stored) so it can be shared another way if the email doesn't arrive. */
export function InvitationSentPanel({ email, inviteUrl, emailSent, onDone }: { email: string; inviteUrl: string; emailSent: boolean; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      // Clipboard refused (permissions, older browser): select the text so it can be copied by hand.
      const input = document.getElementById("invite-link") as HTMLInputElement | null;
      input?.select();
    }
  }

  return (
    <div className="space-y-4">
      <div role="status" className={`border-l-4 bg-surface-muted p-4 text-sm ${emailSent ? "border-success" : "border-warning"}`}>
        <p className="font-semibold text-ink">{emailSent ? "Invitation sent" : "Invitation created, but the email didn't go out"}</p>
        <p className="mt-1 text-ink-muted">
          {emailSent ? <>We emailed {email}. You can also share the link below.</> : <>Share the link below with {email} yourself. It works the same way.</>}
        </p>
      </div>
      <div>
        <label htmlFor="invite-link" className="mb-1.5 block text-sm font-medium text-ink">
          Invitation link
        </label>
        <div className="flex gap-2">
          <input id="invite-link" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} className="min-h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 font-mono text-xs text-ink" />
          <Button type="button" variant="secondary" onClick={copy}>
            {copied ? <Check aria-hidden="true" className="size-[18px]" /> : <Copy aria-hidden="true" className="size-[18px]" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">Only {email} can accept it. It expires in 7 days and is shown only now.</p>
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
