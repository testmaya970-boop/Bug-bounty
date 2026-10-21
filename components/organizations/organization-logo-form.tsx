"use client";

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton } from "../ui/button";
import { OrgLogo } from "../ui/org-logo";
import { removeOrganizationLogoAction, uploadOrganizationLogoAction } from "../../actions/organization-logo";
import { Trash } from "@phosphor-icons/react";

const MAX_BYTES = 256 * 1024;

/** Organization settings: upload or remove the logo shown on this organization's programs.
 * The preview uses the same fixed box as everywhere else, so what you see here is how it fits
 * on program cards. */
export function OrganizationLogoForm({ organizationId, name, version }: { organizationId: string; name: string; version?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setError("Use a PNG, JPEG or WebP image.");
    if (file.size > MAX_BYTES) return setError("The image must be 256 KB or smaller.");
    const data = new FormData();
    data.set("organizationId", organizationId);
    data.set("logo", file);
    setBusy("upload");
    startTransition(async () => {
      const result = await uploadOrganizationLogoAction(data);
      if (input.current) input.current.value = "";
      if (!result.ok) return setError(result.message);
      router.refresh();
    });
  }

  function handleRemove() {
    setError(null);
    setBusy("remove");
    startTransition(async () => {
      const result = await removeOrganizationLogoAction(organizationId);
      if (!result.ok) return setError(result.message);
      router.refresh();
    });
  }

  return (
    <div role="group" aria-label="Organization logo" className="flex flex-wrap items-center gap-4">
      <OrgLogo organizationId={organizationId} name={name} version={version} size="lg" />
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-ink-muted">PNG, JPEG or WebP, up to 256 KB. A square image works best; any shape fits without being cropped.</p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-hover focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
            {pending && busy === "upload" ? "Uploading…" : version ? "Replace logo" : "Upload logo"}
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={pending} onChange={(event) => handleFile(event.target.files?.[0])} />
          </label>
          {version && (
            <IconButton label="Remove" type="button" variant="quiet" className="text-danger" pending={pending && busy === "remove"} disabled={pending && busy === "upload"} onClick={handleRemove}>
              {!(pending && busy === "remove") && <Trash aria-hidden="true" className="size-[18px]" />}
            </IconButton>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
