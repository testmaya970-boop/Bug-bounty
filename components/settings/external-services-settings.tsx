"use client";

import React, { useState, useTransition } from "react";
import { Input, Switch } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { updateMyExternalHandlesAction } from "../../actions/researcher-profiles";
import { EXTERNAL_PLATFORMS, EXTERNAL_PLATFORM_ORDER, normalizeExternalHandle, type ExternalPlatform } from "../../lib/external-profiles";
import type { ExternalProfileSettings } from "../../services/researcher-profiles";

/** Self-reported, explicitly unverified -- see services/researcher-profiles.ts and
 * docs/decisions/0055. Never read by reputation, matching, or any trust-relevant code path.
 * Each field takes a username or a pasted profile link; only the username is saved, and the
 * link shown back is always rebuilt from the platform's own address. Clearing a field
 * removes that profile. */
export function ExternalServicesSettings({ initial }: { initial: ExternalProfileSettings }) {
  const [values, setValues] = useState<Record<ExternalPlatform, string>>(() =>
    Object.fromEntries(EXTERNAL_PLATFORM_ORDER.map((p) => [p, initial[`${p}Handle`] ?? ""])) as Record<ExternalPlatform, string>,
  );
  const [showPublicly, setShowPublicly] = useState(initial.showExternalLinks);
  const [errors, setErrors] = useState<Partial<Record<ExternalPlatform, string>>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set(platform: ExternalPlatform, value: string) {
    setValues((current) => ({ ...current, [platform]: value }));
    setErrors((current) => ({ ...current, [platform]: undefined }));
    setSaved(false);
  }

  // Validate on blur so a pasted link is checked right away, without nagging mid-typing.
  function check(platform: ExternalPlatform) {
    const result = normalizeExternalHandle(platform, values[platform]);
    setErrors((current) => ({ ...current, [platform]: result.ok ? undefined : result.message }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateMyExternalHandlesAction({ handles: values, showExternalLinks: showPublicly });
      if (!result.ok) {
        if (result.field) setErrors((current) => ({ ...current, [result.field as ExternalPlatform]: result.message }));
        else setError(result.message);
        return;
      }
      // Show exactly what was stored: a pasted link now reads as the bare username.
      setValues(Object.fromEntries(EXTERNAL_PLATFORM_ORDER.map((p) => [p, result.data.handles[`${p}Handle`] ?? ""])) as Record<ExternalPlatform, string>);
      setSaved(true);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Alert tone="warning" title="Self-reported, unverified">
        Unpatched does not verify any profile below. They are shown as you enter them, never used as a trust or reputation signal.
      </Alert>

      {EXTERNAL_PLATFORM_ORDER.map((platform) => {
        const def = EXTERNAL_PLATFORMS[platform];
        const normalized = normalizeExternalHandle(platform, values[platform]);
        const link = normalized.ok && normalized.handle ? def.url(normalized.handle) : null;
        return (
          <div key={platform}>
            <Input
              label={`${def.label} username`}
              value={values[platform]}
              onChange={(event) => set(platform, event.target.value)}
              onBlur={() => check(platform)}
              maxLength={300}
              autoComplete="off"
              spellCheck={false}
              error={errors[platform]}
              helperText={errors[platform] ? undefined : `Your username, or paste your profile link. ${def.formatHint}`}
            />
            {link && !errors[platform] && (
              <p className="mt-1 text-xs text-ink-muted">
                Links to{" "}
                <a href={link} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all font-mono text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  {link}
                </a>
              </p>
            )}
          </div>
        );
      })}

      <div className="border-t border-border pt-4">
        <Switch label="Show these on my public profile" checked={showPublicly} onChange={(checked) => { setShowPublicly(checked); setSaved(false); }} />
        <p className="mt-1 text-xs text-ink-muted">Off by default. Only applies once you have a public username.</p>
      </div>

      {saved && <Alert tone="success" title="Saved." />}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
