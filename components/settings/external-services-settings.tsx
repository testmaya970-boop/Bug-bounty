"use client";

import React, { useState, useTransition } from "react";
import { Input } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { updateMyExternalHandlesAction } from "../../actions/researcher-profiles";
import type { ExternalHandles } from "../../services/researcher-profiles";

/** Self-reported, explicitly unverified -- see services/researcher-profiles.ts and this
 * migration's own header comment (docs/decisions/0055). Never read by reputation,
 * matching, or any trust-relevant code path in this product. */
export function ExternalServicesSettings({ initial }: { initial: ExternalHandles }) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof ExternalHandles>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateMyExternalHandlesAction({
        bugcrowdHandle: values.bugcrowdHandle ?? undefined,
        cobaltHandle: values.cobaltHandle ?? undefined,
        githubHandle: values.githubHandle ?? undefined,
        gitlabHandle: values.gitlabHandle ?? undefined,
        xHandle: values.xHandle ?? undefined,
        hacktheboxHandle: values.hacktheboxHandle ?? undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Alert tone="warning" title="Self-reported, unverified">
        Unpatched does not verify any handle below. They are shown as you enter them, never used as a trust or reputation signal.
      </Alert>

      <Input label="Bugcrowd handle" value={values.bugcrowdHandle ?? ""} onChange={(event) => set("bugcrowdHandle", event.target.value)} maxLength={80} helperText="https://bugcrowd.com/<handle>" />
      <Input label="Cobalt handle" value={values.cobaltHandle ?? ""} onChange={(event) => set("cobaltHandle", event.target.value)} maxLength={80} helperText="https://app.cobalt.io/<handle>" />
      <Input label="GitHub handle" value={values.githubHandle ?? ""} onChange={(event) => set("githubHandle", event.target.value)} maxLength={80} helperText="https://github.com/<handle>" />
      <Input label="GitLab handle" value={values.gitlabHandle ?? ""} onChange={(event) => set("gitlabHandle", event.target.value)} maxLength={80} helperText="https://gitlab.com/<handle>" />
      <Input label="X handle" value={values.xHandle ?? ""} onChange={(event) => set("xHandle", event.target.value)} maxLength={80} helperText="https://x.com/<handle>" />
      <Input label="Hack The Box handle" value={values.hacktheboxHandle ?? ""} onChange={(event) => set("hacktheboxHandle", event.target.value)} maxLength={80} helperText="https://app.hackthebox.com/users/<handle>" />

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
