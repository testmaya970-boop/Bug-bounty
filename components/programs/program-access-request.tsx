"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Switch, Textarea } from "../ui/form";
import { Panel } from "../ui/feedback";
import { LocalTime } from "../ui/local-time";
import { decideProgramAccessRequestAction, requestProgramAccessAction, setProgramJoinModeAction, withdrawProgramAccessRequestAction } from "../../actions/program-access";
import type { AccessRequest, ProgramJoinInfo } from "../../services/program-access";

/** Researcher side, on a "by request" public program: ask to join, see the pending request,
 * withdraw it, or read why it was declined. Shown inside the dark "Can I research this?" box. */
export function RequestToJoinPanel({ organizationId, programId, info }: { organizationId: string; programId: string; info: ProgramJoinInfo }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const req = info.myRequest;

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await requestProgramAccessAction({ organizationId, programId, note });
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  }
  function withdraw() {
    if (!req) return;
    startTransition(async () => {
      const result = await withdrawProgramAccessRequestAction({ organizationId, programId, requestId: req.id });
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  }

  if (req?.status === "pending") {
    return (
      <div className="mt-3 space-y-3">
        <p className="text-sm text-canvas/80">
          You asked to join on <LocalTime value={req.at} />. The program team will approve or decline it.
        </p>
        <Button variant="secondary" pending={pending} onClick={withdraw}>
          Withdraw request
        </Button>
        {error && <p role="alert" className="text-sm font-medium text-red-300">{error}</p>}
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-canvas/70">This program reviews who joins. Tell the team why you&apos;re a good fit; they approve or decline each request.</p>
      {req?.status === "declined" && (
        <p className="text-sm text-canvas/80">
          Your last request was declined on <LocalTime value={req.at} />
          {req.decisionNote ? <>: &ldquo;{req.decisionNote}&rdquo;</> : "."} You can ask again 30 days after that.
        </p>
      )}
      <div className="rounded-md bg-canvas p-3 text-ink">
        <Textarea label="Why you'd like to join (optional)" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      <Button pending={pending} onClick={send}>
        Ask to join
      </Button>
      {error && <p role="alert" className="text-sm font-medium text-red-300">{error}</p>}
    </div>
  );
}

/** Staff side: pending requests with each researcher's record, approve or decline. */
export function AccessRequestsPanel({ organizationId, programId, requests }: { organizationId: string; programId: string; requests: AccessRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function decide(id: string, approve: boolean) {
    setError(null);
    setBusy(id + (approve ? ":a" : ":d"));
    startTransition(async () => {
      const result = await decideProgramAccessRequestAction({ organizationId, programId, requestId: id, approve, note: "" });
      setBusy(null);
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  }

  if (requests.length === 0) return null;
  return (
    <section aria-labelledby="access-requests-heading" className="space-y-2">
      <h3 id="access-requests-heading" className="text-sm font-semibold text-ink">
        Requests to join <span className="font-mono text-xs text-ink-muted">({requests.length})</span>
      </h3>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {requests.map((r) => (
          <li key={r.id} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-ink">
                {r.displayName} <span className="font-normal text-ink-muted">@{r.username}</span>
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {r.validCount} valid of {r.closedCount} closed · signal <span className="font-mono tabular-nums">{r.signal > 0 ? "+" : ""}{r.signal.toFixed(2)}</span> · asked <LocalTime value={r.createdAt} />
              </p>
              {r.note && <p className="mt-1 break-words text-sm text-ink">&ldquo;{r.note}&rdquo;</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" pending={busy === r.id + ":d"} disabled={busy !== null} onClick={() => decide(r.id, false)} aria-label={`Decline ${r.displayName}`}>
                Decline
              </Button>
              <Button pending={busy === r.id + ":a"} disabled={busy !== null} onClick={() => decide(r.id, true)} aria-label={`Approve ${r.displayName}`}>
                Approve
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </section>
  );
}

/** Staff setting: open (anyone joins) or by request. */
export function JoinModePanel({ organizationId, programId, joinMode }: { organizationId: string; programId: string; joinMode: "open" | "request" }) {
  const router = useRouter();
  const [byRequest, setByRequest] = useState(joinMode === "request");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function toggle(next: boolean) {
    setByRequest(next);
    setError(null);
    startTransition(async () => {
      const result = await setProgramJoinModeAction({ organizationId, programId, joinMode: next ? "request" : "open" });
      if (!result.ok) {
        setByRequest(!next);
        setError(result.message);
      } else router.refresh();
    });
  }
  return (
    <Panel className="space-y-2 p-5">
      <Switch label={byRequest ? "By request: researchers ask, your team approves" : "Open: any researcher can join"} checked={byRequest} onChange={toggle} />
      {pending && <p className="text-xs text-ink-muted">Saving…</p>}
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </Panel>
  );
}
