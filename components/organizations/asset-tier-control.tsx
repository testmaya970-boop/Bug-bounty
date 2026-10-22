"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { Panel } from "../ui/feedback";
import { setAssetTierAction, setProgramBountyTiersAction } from "../../actions/asset-tiers";

export const TIER_LABEL = { 1: "Tier 1 · critical", 2: "Tier 2", 3: "Tier 3" } as const;

/** One asset's tier: a select for owners and security admins, a label for everyone else. */
export function AssetTierControl({ organizationId, assetId, tier, canEdit, assetName }: { organizationId: string; assetId: string; tier: 1 | 2 | 3; canEdit: boolean; assetName: string }) {
  const router = useRouter();
  const [value, setValue] = useState(tier);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!canEdit) return <span className="text-sm text-ink">{TIER_LABEL[tier]}</span>;
  return (
    <div>
      <label className="sr-only" htmlFor={`tier-${assetId}`}>
        Tier for {assetName}
      </label>
      <select
        id={`tier-${assetId}`}
        value={value}
        disabled={pending}
        onChange={(event) => {
          const next = Number(event.target.value) as 1 | 2 | 3;
          const previous = value;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const result = await setAssetTierAction({ organizationId, assetId, tier: next });
            if (!result.ok) {
              setValue(previous);
              setError(result.message);
            } else router.refresh();
          });
        }}
        className="min-h-9 rounded-md border border-border bg-surface px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <option value={1}>{TIER_LABEL[1]}</option>
        <option value={2}>{TIER_LABEL[2]}</option>
        <option value={3}>{TIER_LABEL[3]}</option>
      </select>
      {error && <p role="alert" className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

/** A program's percentages of its bounty table for tier-2 and tier-3 assets. */
export function BountyTiersPanel({ organizationId, programId, tier2Percent, tier3Percent }: { organizationId: string; programId: string; tier2Percent: number; tier3Percent: number }) {
  const router = useRouter();
  const [t2, setT2] = useState(String(tier2Percent));
  const [t3, setT3] = useState(String(tier3Percent));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Panel className="p-5">
      <form
        aria-label="Bounty by asset tier"
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          startTransition(async () => {
            const result = await setProgramBountyTiersAction({ organizationId, programId, tier2Percent: Number(t2), tier3Percent: Number(t3) });
            if (!result.ok) setMessage({ tone: "error", text: result.message });
            else {
              setMessage({ tone: "ok", text: "Saved. New bounty calculations use these percentages." });
              router.refresh();
            }
          });
        }}
      >
        <p className="text-sm text-ink-muted">Tier 1 assets get the full bounty table. Lower tiers get a share of it; set tiers on the Assets page.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Tier 2 assets get (%)" type="number" inputMode="numeric" min={1} max={100} value={t2} onChange={(event) => setT2(event.target.value)} />
          <Input label="Tier 3 assets get (%)" type="number" inputMode="numeric" min={1} max={100} value={t3} onChange={(event) => setT3(event.target.value)} />
        </div>
        <div className="flex items-center justify-end gap-3">
          {message && (
            <p role={message.tone === "ok" ? "status" : "alert"} className={`text-xs font-medium ${message.tone === "ok" ? "text-success" : "text-danger"}`}>
              {message.text}
            </p>
          )}
          <Button type="submit" variant="secondary" pending={pending}>
            Save tiers
          </Button>
        </div>
      </form>
    </Panel>
  );
}
