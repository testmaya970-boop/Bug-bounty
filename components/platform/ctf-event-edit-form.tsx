"use client";

import React, { useState, useTransition } from "react";
import { Input, Textarea, Select } from "../ui/form";
import { Button } from "../ui/button";
import { updateCtfEventAction, setCtfEventChallengesAction } from "../../actions/ctf-events";
import type { CtfEventAdminDetail, CtfEventStatus } from "../../types/ctf-event";
import type { MockCtfChallenge } from "../../lib/mock/ctf";

/** datetime-local wants "YYYY-MM-DDTHH:mm" in local time; convert the stored ISO instant. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Edit an event's fields AND its challenge set. Two independent saves (event fields via
 * update_ctf_event, the challenge set via set_ctf_event_challenges) so an admin can change
 * either without the other. The picker groups the 28 challenges by category with a running
 * count and a total-points tally, so an admin sees the shape of the event they're building.
 */
export function CtfEventEditForm({ event, allChallenges }: { event: CtfEventAdminDetail; allChallenges: MockCtfChallenge[] }) {
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description);
  const [startsAt, setStartsAt] = useState(isoToLocalInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(event.endsAt));
  const [status, setStatus] = useState<CtfEventStatus>(event.status);
  const [selected, setSelected] = useState<Set<string>>(new Set(event.challengeIds));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [savedFields, setSavedFields] = useState(false);
  const [savedChallenges, setSavedChallenges] = useState(false);
  const [pendingFields, startFields] = useTransition();
  const [pendingChallenges, startChallenges] = useTransition();

  function toIso(local: string): string {
    return local ? new Date(local).toISOString() : "";
  }

  function saveFields(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    setSavedFields(false);
    startFields(async () => {
      const result = await updateCtfEventAction({ eventId: event.id, name, description, startsAt: toIso(startsAt), endsAt: toIso(endsAt), status });
      if (!result.ok) {
        setFieldError(result.message);
        return;
      }
      setSavedFields(true);
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSavedChallenges(false);
  }

  function saveChallenges() {
    setChallengeError(null);
    setSavedChallenges(false);
    startChallenges(async () => {
      const result = await setCtfEventChallengesAction({ eventId: event.id, challengeIds: [...selected] });
      if (!result.ok) {
        setChallengeError(result.message);
        return;
      }
      setSavedChallenges(true);
    });
  }

  const categories = [...new Set(allChallenges.map((c) => c.categoryId))];
  const selectedList = allChallenges.filter((c) => selected.has(c.id));
  const totalPoints = selectedList.reduce((sum, c) => sum + c.points, 0);

  return (
    <div className="space-y-8">
      <form onSubmit={saveFields} className="space-y-4" noValidate>
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Starts at" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          <Input label="Ends at" type="datetime-local" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as CtfEventStatus)}>
          <option value="draft">Draft (hidden)</option>
          <option value="scheduled">Scheduled (published)</option>
          <option value="active">Active (published)</option>
          <option value="ended">Ended (published)</option>
        </Select>
        {fieldError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {fieldError}
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          {savedFields && <span className="text-xs font-medium text-success">Saved.</span>}
          <Button type="submit" pending={pendingFields}>
            Save details
          </Button>
        </div>
      </form>

      <div className="border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-ink">Challenges in this event</h3>
            <p className="mt-0.5 text-xs text-ink-muted">
              {selected.size} selected · {totalPoints.toLocaleString("en-US")} pts total
            </p>
          </div>
          <div className="flex items-center gap-3">
            {savedChallenges && <span className="text-xs font-medium text-success">Saved.</span>}
            {challengeError && (
              <span role="alert" className="text-xs font-medium text-danger">
                {challengeError}
              </span>
            )}
            <Button type="button" variant="secondary" pending={pendingChallenges} onClick={saveChallenges}>
              Save challenge set
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-5">
          {categories.map((categoryId) => {
            const inCategory = allChallenges.filter((c) => c.categoryId === categoryId);
            return (
              <fieldset key={categoryId}>
                <legend className="font-mono text-[11px] font-semibold text-ink-muted">{categoryId}</legend>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {inCategory.map((c) => (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm transition-colors duration-150 ${selected.has(c.id) ? "border-action bg-action/5" : "border-border hover:bg-surface-muted"}`}
                    >
                      <input type="checkbox" className="size-4 accent-action" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                      <span className="min-w-0 flex-1 truncate text-ink">{c.title}</span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-muted">
                        {c.difficulty} · {c.points}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      </div>
    </div>
  );
}
