"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Select, Textarea } from "../ui/form";
import { ToneBadge, TONE } from "../ui/badge";
import { LocalTime } from "../ui/local-time";
import { proposeBonusAction, decideBonusAction, cancelBonusAction } from "../../actions/bonuses";
import { minorUnitsToDecimalString } from "../../lib/money";
import type { Bonus } from "../../services/bonuses";

const REASON: Record<Bonus["reason"], string> = { exceptional_quality: "Exceptional report", retest: "Retest", campaign: "Campaign", other: "Other" };
const STATUS = { proposed: { label: "Awaiting approval", tone: TONE.warning }, approved: { label: "Approved", tone: TONE.success }, rejected: { label: "Rejected", tone: TONE.danger }, cancelled: { label: "Withdrawn", tone: TONE.muted } } as const;

function Decide({ organizationId, bonus }: { organizationId: string; bonus: Bonus }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const go = (approve: boolean) =>
    startTransition(async () => {
      setError(null);
      const r = await decideBonusAction(organizationId, bonus.id, approve, note);
      if (!r.ok) return setError(r.message);
      router.refresh();
    });
  return (
    <div className="mt-2 space-y-2">
      <Input label="Note" helperText="Required to reject." value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button pending={pending} onClick={() => go(true)}>
          Approve and pay
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => go(false)}>
          Reject
        </Button>
      </div>
    </div>
  );
}

/** One bonus: who proposed it, and the decision controls for a second admin. */
export function BonusItem({ organizationId, bonus, currentUserId, canDecide, showReport }: { organizationId: string; bonus: Bonus; currentUserId: string; canDecide: boolean; showReport?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold text-ink">
          {bonus.currency} {minorUnitsToDecimalString(bonus.amountMinorUnits)}
        </span>
        <ToneBadge tone={STATUS[bonus.status].tone}>{STATUS[bonus.status].label}</ToneBadge>
        <span className="text-xs text-ink-muted">{REASON[bonus.reason]}</span>
      </div>
      {showReport && bonus.reportTitle && <p className="mt-1 text-sm text-ink">{bonus.reportTitle}</p>}
      <p className="mt-1 text-sm text-ink-muted">&ldquo;{bonus.note}&rdquo;</p>
      <p className="mt-1 text-xs text-ink-muted">
        Proposed by {bonus.proposedByName ?? "a team member"} · <LocalTime value={bonus.proposedAt} />
        {bonus.decisionNote && ` · ${bonus.decisionNote}`}
      </p>
      {bonus.status === "proposed" &&
        (bonus.proposedBy === currentUserId ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            Someone else must approve it.
            <Button variant="quiet" pending={pending} onClick={() => startTransition(async () => { await cancelBonusAction(organizationId, bonus.id); router.refresh(); })}>
              Withdraw
            </Button>
          </div>
        ) : canDecide ? (
          <Decide organizationId={organizationId} bonus={bonus} />
        ) : (
          <p className="mt-1 text-xs text-ink-muted">Waiting for an owner or security admin.</p>
        ))}
    </li>
  );
}

export function ProposeBonusForm({ organizationId, reportId, currency, maxMinorUnits }: { organizationId: string; reportId: string; currency: string; maxMinorUnits: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<Bonus["reason"]>("exceptional_quality");
  const [note, setNote] = useState("");
  // One key per form: a retried or double-clicked submit can never create two bonuses.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await proposeBonusAction({ organizationId, reportId, amount, reason, note, idempotencyKey: key });
          if (!r.ok) return setError(r.message);
          setDone(true);
          setAmount("");
          setNote("");
          setKey(crypto.randomUUID());
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label={`Amount (${currency})`} inputMode="decimal" helperText={`Up to ${currency} ${minorUnitsToDecimalString(maxMinorUnits)}`} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value as Bonus["reason"])}>
          {Object.entries(REASON).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>
      <Textarea label="Note to the researcher" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} required />
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm font-medium text-success">
          Proposed. A second owner or security admin approves it before anything is paid.
        </p>
      )}
      <Button type="submit" pending={pending}>
        Propose bonus
      </Button>
    </form>
  );
}
