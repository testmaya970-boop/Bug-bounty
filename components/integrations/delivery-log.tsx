import React from "react";
import { LocalTime } from "../ui/local-time";
import { ToneBadge, TONE } from "../ui/badge";
import { ActionButton } from "../researcher/journey-controls";
import { replayDeliveryAction } from "../../actions/org-integrations";
import type { Delivery } from "../../services/org-integrations";

const STATUS = {
  succeeded: { label: "Delivered", tone: TONE.success },
  failed: { label: "Failed", tone: TONE.danger },
  pending: { label: "Retrying", tone: TONE.warning },
  delivering: { label: "Sending", tone: TONE.info },
} as const;

/** The most recent deliveries: what was sent, what came back, and a replay for anything that
 * needs to go again (same message id, so a receiver that already has it can drop it). */
export function DeliveryLog({ organizationId, deliveries, targetNames }: { organizationId: string; deliveries: Delivery[]; targetNames: Record<string, string> }) {
  if (deliveries.length === 0) return <p className="text-sm text-ink-muted">Nothing sent yet. Use Send test to check a connection.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-surface-muted text-xs text-ink-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Event</th>
            <th scope="col" className="px-3 py-2 font-semibold">To</th>
            <th scope="col" className="px-3 py-2 font-semibold">Result</th>
            <th scope="col" className="px-3 py-2 font-semibold">When</th>
            <th scope="col" className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {deliveries.map((d) => {
            const s = STATUS[d.status];
            return (
              <tr key={d.id} className="align-top">
                <td className="px-3 py-2 font-mono text-xs text-ink">
                  {d.eventType}
                  {d.isReplay && <span className="ml-1 text-ink-muted">(replay)</span>}
                </td>
                <td className="px-3 py-2 text-ink-muted">{targetNames[d.targetId] ?? "Removed"}</td>
                <td className="px-3 py-2">
                  <ToneBadge tone={s.tone}>{s.label}</ToneBadge>
                  <p className="mt-1 text-xs text-ink-muted">
                    {d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : d.lastError ?? ""}
                    {d.durationMs !== null && ` · ${d.durationMs} ms`} · attempt {d.attempts}/{d.maxAttempts}
                    {d.status === "pending" && d.attempts > 0 && (
                      <>
                        {" "}
                        · next <LocalTime value={d.nextAttemptAt} />
                      </>
                    )}
                  </p>
                  {d.status === "failed" && d.lastError && <p className="mt-1 break-all text-xs text-danger">{d.lastError}</p>}
                </td>
                <td className="px-3 py-2 text-xs text-ink-muted">
                  <LocalTime value={d.createdAt} />
                </td>
                <td className="px-3 py-2 text-right">
                  {(d.status === "failed" || d.status === "succeeded") && targetNames[d.targetId] && d.eventType !== "integration.test" && (
                    <ActionButton variant="quiet" action={replayDeliveryAction.bind(null, organizationId, d.id)}>
                      Replay
                    </ActionButton>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
