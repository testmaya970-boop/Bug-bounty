"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Input, Select, Textarea } from "../ui/form";
import { addScopeEntryAction } from "../../actions/scope";
import { assetTypeLabel } from "../../lib/scope-labels";
import type { ProgramAssetType, ScopeState } from "../../types/scope";

const ASSET_TYPES: ProgramAssetType[] = ["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"];

const TARGET_PLACEHOLDER: Record<ProgramAssetType, string> = {
  domain: "api.example.com or *.example.com",
  url: "https://api.example.com/admin",
  ip_cidr: "203.0.113.0/24 or 203.0.113.5",
  ios_app: "https://apps.apple.com/app/id123456789 or com.example.app",
  android_app: "https://play.google.com/store/apps/details?id=com.example.app",
  source_code: "https://github.com/example/repo",
  hardware: "Model XR-200 router",
  ai_model: "gpt-example-v2 or https://api.example.com/v1/chat/completions",
};

export function AddScopeEntryDialog({ organizationId, programId }: { organizationId: string; programId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assetType, setAssetType] = useState<ProgramAssetType>("domain");
  const [target, setTarget] = useState("");
  const [scopeState, setScopeState] = useState<ScopeState>("in_scope");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setAssetType("domain");
    setTarget("");
    setScopeState("in_scope");
    setDescription("");
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await addScopeEntryAction({ organizationId, programId, assetType, targetInput: target, scopeState, description: description || undefined });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Only close/refresh once the database has actually committed.
      setOpen(false);
      setAssetType("domain");
      setTarget("");
      setScopeState("in_scope");
      setDescription("");
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Add scope</Button>
      <Dialog open={open} title="Add scope entry" onClose={close}>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <p className="text-sm text-ink-muted">This defines what researchers are permitted to test once researcher access exists.</p>
          <Select
            label="Target type"
            value={assetType}
            onChange={(event) => {
              setAssetType(event.target.value as ProgramAssetType);
              setTarget("");
            }}
          >
            {ASSET_TYPES.map((type) => (
              <option key={type} value={type}>
                {assetTypeLabel(type)}
              </option>
            ))}
          </Select>
          <Input
            label="Target"
            required
            autoFocus
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder={TARGET_PLACEHOLDER[assetType]}
            className="[&_input]:font-mono"
            maxLength={2048}
            error={error ?? undefined}
          />
          <Select label="Scope state" value={scopeState} onChange={(event) => setScopeState(event.target.value as ScopeState)}>
            <option value="in_scope">In scope</option>
            <option value="out_of_scope">Out of scope</option>
          </Select>
          <Textarea label="Description" helperText="Optional." value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Add scope entry
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
