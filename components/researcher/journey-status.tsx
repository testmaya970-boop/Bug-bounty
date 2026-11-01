import React from "react";
import { ToneBadge, TONE } from "../ui/badge";

// One label and tone for every workflow state the researcher journey uses (202610280001).
const STATES: Record<string, { label: string; tone: (typeof TONE)[keyof typeof TONE] }> = {
  pending: { label: "Pending", tone: TONE.warning },
  proposed: { label: "Waiting on you", tone: TONE.warning },
  requested: { label: "Requested", tone: TONE.warning },
  accepted: { label: "Accepted", tone: TONE.success },
  approved: { label: "Approved", tone: TONE.info },
  assigned: { label: "CVE assigned", tone: TONE.success },
  published: { label: "Public", tone: TONE.success },
  registered: { label: "Registered", tone: TONE.success },
  shipped: { label: "Shipped", tone: TONE.success },
  completed: { label: "Completed", tone: TONE.muted },
  declined: { label: "Declined", tone: TONE.muted },
  rejected: { label: "Rejected", tone: TONE.danger },
  revoked: { label: "Revoked", tone: TONE.muted },
  withdrawn: { label: "Withdrawn", tone: TONE.muted },
  cancelled: { label: "Cancelled", tone: TONE.muted },
  expired: { label: "Expired", tone: TONE.muted },
  draft: { label: "Draft", tone: TONE.muted },
};

export function JourneyStatus({ status }: { status: string }) {
  const s = STATES[status] ?? { label: status, tone: TONE.muted };
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}
