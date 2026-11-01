"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/form";
import { createExportScheduleAction, deleteExportScheduleAction } from "../../actions/analytics-exports";

/** Saves the current Explore filters as a weekly or monthly export. */
export function ScheduleExportForm({ organizationId, query }: { organizationId: string; query: string }) {
  const router = useRouter();
  const [name, setName] = useState("Weekly security report");
  const [format, setFormat] = useState<"csv" | "xlsx" | "pdf">("pdf");
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("weekly");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          setDone(false);
          const r = await createExportScheduleAction({ organizationId, name, format, frequency, query });
          if (!r.ok) return setError(r.message);
          setDone(true);
          router.refresh();
        });
      }}
    >
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
      <Select label="Format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
        <option value="pdf">PDF executive report</option>
        <option value="xlsx">Excel workbook</option>
        <option value="csv">CSV (report rows)</option>
      </Select>
      <Select label="Every" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
        <option value="weekly">Week (Mondays, covers the previous week)</option>
        <option value="monthly">Month (the 1st, covers the previous month)</option>
      </Select>
      <Button type="submit" pending={pending}>
        Schedule
      </Button>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger sm:col-span-4">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm text-success sm:col-span-4">
          Scheduled. You&apos;ll get an email with a download link after each run.
        </p>
      )}
    </form>
  );
}

export function DeleteScheduleButton({ organizationId, scheduleId }: { organizationId: string; scheduleId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="quiet"
      pending={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteExportScheduleAction(organizationId, scheduleId);
          router.refresh();
        })
      }
    >
      Stop
    </Button>
  );
}
