import React from "react";
import { EmptyState } from "../../../components/ui/feedback";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { LocalTime } from "../../../components/ui/local-time";
import { ActionButton } from "../../../components/researcher/journey-controls";
import { SwagRequestForm } from "../../../components/researcher/journey-forms";
import { JourneyStatus } from "../../../components/researcher/journey-status";
import { requireResearcherSettings } from "../../../lib/auth/account-type";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { getResearcherReputationScore } from "../../../services/reputation";
import { listSwag } from "../../../services/researcher-journey";
import { cancelSwagRequestAction } from "../../../actions/researcher-journey";

/** Physical rewards Unpatched staff stock and ship by hand (202610280001). Stock is what staff
 * entered; nothing ships until staff approve, and approval takes one from stock. */
export default async function SwagSettingsPage() {
  await requireResearcherSettings();
  const user = await getCurrentUser();
  const [{ items, requests }, reputation] = await Promise.all([listSwag(), user ? getResearcherReputationScore(user.id) : Promise.resolve(0)]);
  const open = new Set(requests.filter((r) => r.status === "requested" || r.status === "approved").map((r) => r.itemId));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Swag</h1>
        <p className="mt-1 text-sm text-ink-muted">Physical rewards for your research. Your reputation is {reputation}; some items need more.</p>
      </div>

      <section className="space-y-3">
        <SectionLabel>Catalog</SectionLabel>
        {items.length === 0 ? (
          <EmptyState title="Nothing in the catalog yet">Unpatched staff add items here when there is stock to send. Check back later.</EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map((item) => {
              const reason = item.stock === 0 ? "Out of stock" : reputation < item.minReputation ? `Needs ${item.minReputation} reputation` : open.has(item.id) ? "You have an open request" : null;
              return (
                <li key={item.id} className="min-w-0 rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-ink">{item.name}</p>
                    <span className="font-mono text-xs text-ink-muted">{item.stock} left</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{item.description}</p>
                  {item.minReputation > 0 && <p className="mt-1 text-xs text-ink-muted">Reputation {item.minReputation}+</p>}
                  <div className="mt-3">{reason ? <p className="text-sm font-medium text-ink-muted">{reason}</p> : <SwagRequestForm itemId={item.id} />}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel>Your requests</SectionLabel>
        {requests.length === 0 ? (
          <p className="text-sm text-ink-muted">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {requests.map((r) => (
              <li key={r.id} className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{r.itemName}</span>
                    <JourneyStatus status={r.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    Requested <LocalTime value={r.createdAt} dateOnly />
                    {r.trackingReference && ` · tracking ${r.trackingReference}`}
                    {r.staffNote && ` · ${r.staffNote}`}
                  </p>
                </div>
                {r.status === "requested" && (
                  <ActionButton variant="quiet" action={cancelSwagRequestAction.bind(null, r.id)}>
                    Cancel
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
