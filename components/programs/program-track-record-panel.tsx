"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "../ui/feedback";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { setProgramTrackRecordRequirementAction } from "../../actions/programs";

/** Minimum track record to join publicly (202610220001): valid reports and/or signal. Blank
 * means no requirement. Invited researchers are always exempt. */
export function ProgramTrackRecordPanel({ organizationId, programId, minSignal, minValidReports }: { organizationId: string; programId: string; minSignal: number | null; minValidReports: number | null }) {
  const router = useRouter();
  const [reports, setReports] = useState(minValidReports ? String(minValidReports) : "");
  const [signal, setSignal] = useState(minSignal == null ? "" : minSignal.toFixed(2));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const minReports = reports.trim() === "" ? null : Number(reports);
    const min = signal.trim() === "" ? null : Number(signal);
    startTransition(async () => {
      const result = await setProgramTrackRecordRequirementAction({ organizationId, programId, minSignal: min, minValidReports: minReports });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      setMessage({ tone: "ok", text: min == null && !minReports ? "Saved. Anyone can join." : "Saved. Researchers below this record can't join on their own." });
      router.refresh();
    });
  }

  return (
    <Panel className="p-5">
      <form onSubmit={handleSubmit} noValidate aria-label="Track record requirement" className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Valid reports, at least" helperText="Accepted or resolved reports on Unpatched. Blank for none." type="number" inputMode="numeric" min={0} max={1000} value={reports} onChange={(event) => setReports(event.target.value)} />
          <Input label="Signal, at least" helperText="-1.00 to 1.00: the average outcome of their last 30 closed reports. Blank for none." type="number" inputMode="decimal" min={-1} max={1} step={0.05} value={signal} onChange={(event) => setSignal(event.target.value)} />
        </div>
        <div className="flex items-center justify-end gap-3">
          {message && (
            <p role={message.tone === "ok" ? "status" : "alert"} className={`text-xs font-medium ${message.tone === "ok" ? "text-success" : "text-danger"}`}>
              {message.text}
            </p>
          )}
          <Button type="submit" variant="secondary" pending={pending}>
            Save requirement
          </Button>
        </div>
      </form>
    </Panel>
  );
}
