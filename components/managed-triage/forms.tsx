"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Select, Textarea } from "../ui/form";
import { ToneBadge, TONE } from "../ui/badge";
import { LocalTime } from "../ui/local-time";
import { formatMoney } from "../../lib/money";
import {
  addAnalystAction,
  answerEscalationAction,
  cancelManagedTriageAction,
  claimReportAction,
  decideSubscriptionAction,
  escalateAction,
  recordAssessmentAction,
  releaseReportAction,
  removeAnalystAction,
  revokeAnalystInvitationAction,
  requestManagedTriageAction,
  resumeManagedTriageAction,
} from "../../actions/managed-triage";
import type { Assessment, Escalation, Plan } from "../../services/managed-triage";

type Result = { ok: true } | { ok: false; message: string };

/** Runs an action, shows its error, refreshes the server data on success. */
function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const go = (work: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const r = await work();
      if (!r.ok) return setError(r.message);
      after?.();
      router.refresh();
    });
  const errorText = error && (
    <p role="alert" className="text-sm font-medium text-danger">
      {error}
    </p>
  );
  return { go, pending, errorText };
}

export const REASON_LABELS: Record<string, string> = {
  severity_decision: "Severity decision",
  scope_question: "Scope question",
  business_impact: "Business impact",
  sensitive_data: "Sensitive data involved",
  bounty_recommendation: "Bounty recommendation",
  other: "Other",
};
export const VALIDATION_LABELS: Record<Assessment["validation"], string> = {
  reproduced: "Reproduced",
  not_reproduced: "Could not reproduce",
  needs_information: "Needs information from the researcher",
  out_of_scope: "Out of scope",
};

// ---------------------------------------------------------------------------
// Organization: buying the service
// ---------------------------------------------------------------------------

export function PlanPicker({ organizationId, plans, defaultCurrency }: { organizationId: string; plans: Plan[]; defaultCurrency: "INR" | "USD" }) {
  const { go, pending, errorText } = useAction();
  const [currency, setCurrency] = useState(defaultCurrency);
  const [chosen, setChosen] = useState<Plan["code"]>("standard");
  return (
    <div className="space-y-4">
      <fieldset className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <legend className="sr-only">Plan</legend>
        {plans.map((p) => (
          <label key={p.code} className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 ${chosen === p.code ? "border-action bg-surface ring-1 ring-action" : "border-border bg-surface hover:border-ink-muted"}`}>
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-semibold text-ink">
                <input type="radio" name="plan" value={p.code} checked={chosen === p.code} onChange={() => setChosen(p.code)} className="accent-[var(--color-action)]" />
                {p.name}
              </span>
              <span className="font-mono text-sm text-ink">
                {formatMoney(currency === "USD" ? p.priceUsdMinorUnits : p.priceInrMinorUnits, currency)}
                <span className="text-ink-muted"> / month</span>
              </span>
            </span>
            <span className="text-sm text-ink-muted">{p.description}</span>
            <span className="flex flex-wrap gap-1.5 text-xs">
              <ToneBadge tone={TONE.muted}>First response {p.firstResponseTargetHours}h</ToneBadge>
              <ToneBadge tone={TONE.muted}>Triaged within {p.triageTargetHours}h</ToneBadge>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Pay in" value={currency} onChange={(e) => setCurrency(e.target.value as "INR" | "USD")}>
          <option value="USD">USD</option>
          <option value="INR">INR</option>
        </Select>
        <Button pending={pending} onClick={() => go(() => requestManagedTriageAction(organizationId, chosen, currency))}>
          Request Managed Triage
        </Button>
      </div>
      <p className="text-xs text-ink-muted">Unpatched confirms the request, then charges the first month to your prepaid balance and assigns analysts. It renews monthly from the balance; cancel any time.</p>
      {errorText}
    </div>
  );
}

export function CancelSubscription({ organizationId, active }: { organizationId: string; active: boolean }) {
  const { go, pending, errorText } = useAction();
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        {active ? "Cancel Managed Triage" : "Withdraw request"}
      </Button>
    );
  return (
    <div className="space-y-2 rounded-md border border-border bg-surface-muted p-3">
      <p className="text-sm text-ink">{active ? "Analysts stop working your reports now. The current month is not refunded." : "Your request will be withdrawn."}</p>
      <div className="flex gap-2">
        <Button variant="destructive" pending={pending} onClick={() => go(() => cancelManagedTriageAction(organizationId))}>
          Yes, cancel
        </Button>
        <Button variant="quiet" onClick={() => setConfirming(false)}>
          Keep it
        </Button>
      </div>
      {errorText}
    </div>
  );
}

export function ResumeSubscription({ organizationId }: { organizationId: string }) {
  const { go, pending, errorText } = useAction();
  return (
    <div className="space-y-2">
      <Button pending={pending} onClick={() => go(() => resumeManagedTriageAction(organizationId))}>
        Pay and resume
      </Button>
      {errorText}
    </div>
  );
}

export function AnswerEscalation({ escalationId }: { escalationId: string }) {
  const { go, pending, errorText } = useAction();
  const [answer, setAnswer] = useState("");
  return (
    <div className="mt-2 space-y-2">
      <Textarea label="Your answer" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={4000} rows={3} helperText="Goes to the Unpatched analyst, never to the researcher." />
      <Button pending={pending} onClick={() => go(() => answerEscalationAction(escalationId, answer), () => setAnswer(""))}>
        Send answer
      </Button>
      {errorText}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report page: the triage panel (analysts work it; the organization answers)
// ---------------------------------------------------------------------------

export function EscalationItem({ e, canAnswer, reportHref }: { e: Escalation; canAnswer: boolean; reportHref?: string }) {
  return (
    <li className="py-3">
      {reportHref && (
        <a href={reportHref} className="mb-1 block text-sm font-medium text-ink hover:text-action">
          {e.reportTitle ?? "Report"}
        </a>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ToneBadge tone={e.status === "open" ? TONE.warning : TONE.success}>{e.status === "open" ? "Waiting for the organization" : "Answered"}</ToneBadge>
        <span className="text-xs text-ink-muted">{REASON_LABELS[e.reason] ?? e.reason}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{e.question}</p>
      <p className="mt-1 text-xs text-ink-muted">
        {e.raisedByName ?? "Unpatched analyst"} · <LocalTime value={e.createdAt} />
      </p>
      {e.answer && (
        <div className="mt-2 rounded-md bg-surface-muted p-2.5">
          <p className="whitespace-pre-wrap text-sm text-ink">{e.answer}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {e.answeredByName ?? "The organization"} · {e.answeredAt && <LocalTime value={e.answeredAt} />}
          </p>
        </div>
      )}
      {e.status === "open" && canAnswer && <AnswerEscalation escalationId={e.id} />}
    </li>
  );
}

export function ReportTriagePanel({
  reportId,
  viewer,
  currentUserId,
  claimedBy,
  claimedByName,
  escalations,
  assessments,
}: {
  reportId: string;
  viewer: "analyst" | "organization";
  currentUserId: string;
  claimedBy: string | null;
  claimedByName: string | null;
  escalations: Escalation[];
  assessments: Assessment[];
}) {
  const claim = useAction();
  const assess = useAction();
  const escalate = useAction();
  const [validation, setValidation] = useState<Assessment["validation"]>("reproduced");
  const [severity, setSeverity] = useState("");
  const [duplicateOf, setDuplicateOf] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("severity_decision");
  const [question, setQuestion] = useState("");
  const mine = claimedBy === currentUserId;
  const hasOpen = escalations.some((e) => e.status === "open");

  return (
    <div className="space-y-4">
      {viewer === "analyst" ? (
        <div className="flex flex-wrap items-center gap-2">
          {mine ? (
            <>
              <ToneBadge tone={TONE.success}>You are working this report</ToneBadge>
              <Button variant="quiet" pending={claim.pending} onClick={() => claim.go(() => releaseReportAction(reportId))}>
                Release
              </Button>
            </>
          ) : claimedBy ? (
            <>
              <span className="text-sm text-ink-muted">{claimedByName ?? "Another analyst"} is working this report.</span>
              <Button variant="secondary" pending={claim.pending} onClick={() => claim.go(() => claimReportAction(reportId, true))}>
                Take over
              </Button>
            </>
          ) : (
            <Button pending={claim.pending} onClick={() => claim.go(() => claimReportAction(reportId))}>
              Claim report
            </Button>
          )}
          {claim.errorText}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{claimedBy ? `${claimedByName ?? "An Unpatched analyst"} is triaging this report.` : "Waiting for an Unpatched analyst to pick this report up."}</p>
      )}

      {viewer === "analyst" && (
        <details className="rounded-md border border-border p-3" open={assessments.length === 0}>
          <summary className="cursor-pointer text-sm font-medium text-ink">Record validation</summary>
          <div className="mt-3 space-y-3">
            <Select label="Outcome" value={validation} onChange={(e) => setValidation(e.target.value as Assessment["validation"])}>
              {Object.entries(VALIDATION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Select label="Suggested severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="">No suggestion</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="none">Info</option>
            </Select>
            <Input label="Possible duplicate of (report id)" value={duplicateOf} onChange={(e) => setDuplicateOf(e.target.value.trim())} placeholder="Optional" helperText="Use the duplicate suggestions on this page to find the original." />
            <Textarea label="What you checked" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={4000} helperText="Internal: the organization's team sees this, the researcher never does." />
            <Button
              pending={assess.pending}
              onClick={() => assess.go(() => recordAssessmentAction({ reportId, validation, suggestedSeverity: severity as "", duplicateOf, notes }), () => setNotes(""))}
            >
              Save validation
            </Button>
            {assess.errorText}
          </div>
        </details>
      )}

      {assessments.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Validation</p>
          <ul className="mt-1 divide-y divide-border">
            {assessments.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <ToneBadge tone={a.validation === "reproduced" ? TONE.success : a.validation === "needs_information" ? TONE.warning : TONE.muted}>{VALIDATION_LABELS[a.validation]}</ToneBadge>
                  {a.suggestedSeverity && <span className="text-xs text-ink-muted">Suggested: {a.suggestedSeverity === "none" ? "Info" : a.suggestedSeverity}</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{a.notes}</p>
                {a.duplicateOfReportId && <p className="mt-1 font-mono text-xs text-ink-muted">Possible duplicate of {a.duplicateOfReportId}</p>}
                <p className="mt-1 text-xs text-ink-muted">
                  {a.assessedByName ?? "Analyst"} · <LocalTime value={a.createdAt} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {viewer === "analyst" && !hasOpen && (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-ink">Ask the organization</summary>
          <div className="mt-3 space-y-3">
            <Select label="Why they need to decide" value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries(REASON_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Textarea label="Question" value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={4000} helperText="Owners, security admins and the program team are notified." />
            <Button pending={escalate.pending} onClick={() => escalate.go(() => escalateAction({ reportId, reason: reason as "other", question }), () => setQuestion(""))}>
              Escalate to the organization
            </Button>
            {escalate.errorText}
          </div>
        </details>
      )}

      {escalations.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Questions for the organization</p>
          <ul className="mt-1 divide-y divide-border">
            {escalations.map((e) => (
              <EscalationItem key={e.id} e={e} canAnswer={viewer === "organization"} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function QueueClaimButton({ reportId }: { reportId: string }) {
  const { go, pending, errorText } = useAction();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant="secondary" pending={pending} onClick={() => go(() => claimReportAction(reportId))}>
        Claim
      </Button>
      {errorText}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------

export function DecideSubscription({ organizationId }: { organizationId: string }) {
  const { go, pending, errorText } = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="mt-2 space-y-2">
      <Input label="Note to the organization" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} helperText="Required to decline." />
      <div className="flex flex-wrap gap-2">
        <Button pending={pending} onClick={() => go(() => decideSubscriptionAction(organizationId, true, note))}>
          Activate and charge first month
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => go(() => decideSubscriptionAction(organizationId, false, note))}>
          Decline
        </Button>
      </div>
      {errorText}
    </div>
  );
}

export function AdminCancelSubscription({ organizationId }: { organizationId: string }) {
  const { go, pending, errorText } = useAction();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button variant="quiet" pending={pending} onClick={() => go(() => cancelManagedTriageAction(organizationId))}>
        Stop service
      </Button>
      {errorText}
    </span>
  );
}

export function AddAnalyst() {
  const { go, pending, errorText } = useAction();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ to: string; emailed: boolean; mode: "added" | "invited" } | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Input label="Analyst's email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} helperText="With an account, they become an analyst now. Without one, they get a link to create it and join." />
        <Button
          pending={pending}
          onClick={() => {
            const to = email;
            setSent(null);
            go(async () => {
              const r = await addAnalystAction(to);
              if (r.ok) setSent({ to, emailed: r.emailed === true, mode: r.mode ?? "added" });
              return r;
            }, () => setEmail(""));
          }}
        >
          Invite analyst
        </Button>
      </div>
      {sent && (
        <p role="status" className={`text-sm ${sent.emailed ? "text-success" : "text-warning"}`}>
          {sent.mode === "invited"
            ? sent.emailed
              ? `Invited. ${sent.to} has no account yet, so we emailed a 14-day link to create one and join.`
              : `Invitation saved, but the email to ${sent.to} could not be sent. Revoke it and invite again once email works.`
            : sent.emailed
              ? `Added. We emailed ${sent.to} how to sign in, turn on two-factor and open the queue.`
              : `Added, but the email to ${sent.to} could not be sent. Tell them to sign in, turn on two-factor in Security settings, then open /triage.`}
        </p>
      )}
      {errorText}
    </div>
  );
}

export function RevokeAnalystInvitation({ invitationId }: { invitationId: string }) {
  const { go, pending } = useAction();
  return (
    <Button variant="quiet" pending={pending} onClick={() => go(() => revokeAnalystInvitationAction(invitationId))}>
      Revoke
    </Button>
  );
}

export function RemoveAnalyst({ userId }: { userId: string }) {
  const { go, pending } = useAction();
  return (
    <Button variant="quiet" pending={pending} onClick={() => go(() => removeAnalystAction(userId))}>
      Remove
    </Button>
  );
}
