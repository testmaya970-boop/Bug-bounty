"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Input, Switch } from "../ui/form";
import { updateEngagementEmailSettingsAction } from "../../actions/engagement-emails";
import type { EngagementEmailSettings } from "../../services/engagement-emails";

export function EngagementEmailForm({ settings }: { settings: EngagementEmailSettings }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [inactive, setInactive] = useState(String(settings.inactiveAfterDays));
  const [between, setBetween] = useState(String(settings.minDaysBetween));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateEngagementEmailSettingsAction({ enabled, inactiveAfterDays: Number(inactive), minDaysBetween: Number(between) });
      setMessage(result.ok ? { tone: "ok", text: enabled ? "Saved. Program-match emails are on." : "Saved. Program-match emails are paused." } : { tone: "error", text: result.message });
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Engagement email settings" className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <Switch label="Send program-match emails" checked={enabled} onChange={setEnabled} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Inactive after (days)" helperText="Only researchers who haven't used Unpatched for this long." type="number" inputMode="numeric" min={1} max={365} value={inactive} onChange={(event) => setInactive(event.target.value)} />
        <Input label="At most one email every (days)" helperText="Per researcher, across all programs." type="number" inputMode="numeric" min={1} max={90} value={between} onChange={(event) => setBetween(event.target.value)} />
      </div>
      <div className="flex items-center justify-end gap-3">
        {message && (
          <p role={message.tone === "ok" ? "status" : "alert"} className={`text-xs font-medium ${message.tone === "ok" ? "text-success" : "text-danger"}`}>
            {message.text}
          </p>
        )}
        <Button type="submit" pending={pending}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
