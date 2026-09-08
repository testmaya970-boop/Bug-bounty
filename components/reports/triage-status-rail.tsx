"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import { StatusBadge, SeverityBadge } from "../ui/badge";
import { reportStatusMeaning } from "../../lib/report-status";
import type { ReportSeverity, ReportStatus } from "../../types/report";

type TriageStatusState = { status: ReportStatus; confirmedSeverity: ReportSeverity | null };

type TriageStatusContextValue = {
  state: TriageStatusState;
  setOptimistic: (next: Partial<TriageStatusState>) => TriageStatusState;
  rollback: (previous: TriageStatusState) => void;
};

const TriageStatusContext = createContext<TriageStatusContextValue | null>(null);

/**
 * Gives the report detail page's two StatusBadge instances (the top case-header strip and
 * the decision rail) an instantly-updating local copy of status/severity, so a triage click
 * (Accept/Reject/Resolve/etc, or a severity change) is visible the moment the action
 * resolves -- not only after router.refresh() re-renders the whole Server Component tree.
 * Deliberately scoped to ONLY these two badges plus the rail's meaning sentence: every other
 * status-derived section on this page (bounty visibility, disclosure, resolution summary,
 * allowedNext/isFinal-gated controls) still waits for the real router.refresh() to reconcile,
 * since faithfully mirroring their server-side derivation client-side would risk a page that
 * shows an inconsistent combination of sections between the optimistic update and the real
 * one landing. On failure, callers roll back to the exact previous state so the badge never
 * shows a status the server rejected.
 */
export function TriageStatusRailProvider({ initialStatus, initialSeverity, children }: { initialStatus: ReportStatus; initialSeverity: ReportSeverity | null; children: React.ReactNode }) {
  const [state, setState] = useState<TriageStatusState>({ status: initialStatus, confirmedSeverity: initialSeverity });

  const value = useMemo<TriageStatusContextValue>(
    () => ({
      state,
      setOptimistic: (next) => {
        const previous = state;
        setState((current) => ({ ...current, ...next }));
        return previous;
      },
      rollback: (previous) => setState(previous),
    }),
    [state],
  );

  return <TriageStatusContext.Provider value={value}>{children}</TriageStatusContext.Provider>;
}

export function useTriageStatus() {
  const context = useContext(TriageStatusContext);
  if (!context) throw new Error("useTriageStatus must be used within a TriageStatusRailProvider");
  return context;
}

export function LiveStatusBadge() {
  const { state } = useTriageStatus();
  return <StatusBadge status={state.status} />;
}

export function LiveSeverityBadge() {
  const { state } = useTriageStatus();
  if (!state.confirmedSeverity) return null;
  return <SeverityBadge severity={state.confirmedSeverity} />;
}

export function LiveStatusMeaning() {
  const { state } = useTriageStatus();
  return <>{reportStatusMeaning(state.status)}</>;
}
