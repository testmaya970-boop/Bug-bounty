"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Input, Textarea, Select } from "../ui/form";
import { Button } from "../ui/button";
import { createCtfEventAction } from "../../actions/ctf-events";
import type { CtfEventStatus } from "../../types/ctf-event";

/** Create a CTF event. datetime-local inputs (native picker) are converted to ISO on submit.
 * On success, routes to the event's edit page so the admin picks its challenges next. */
export function CtfEventCreateForm() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [status, setStatus] = useState<CtfEventStatus>("scheduled");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toIso(local: string): string {
    // datetime-local has no zone; interpret in the admin's own zone (what they see) and send ISO.
    return local ? new Date(local).toISOString() : "";
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCtfEventAction({ slug, name, description, startsAt: toIso(startsAt), endsAt: toIso(endsAt), status });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/platform/ctf-events/${result.data.id}` as Route);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Autumn Clash 2026" />
      <Input
        label="Slug"
        required
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        maxLength={120}
        placeholder="autumn-clash-2026"
        helperText="Lowercase words separated by hyphens. Used in the event URL."
        spellCheck={false}
        autoComplete="off"
      />
      <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} helperText="Shown on the event card and detail page." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Starts at" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <Input label="Ends at" type="datetime-local" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </div>
      <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as CtfEventStatus)} helperText="Draft events are hidden from researchers. Scheduled/active/ended are published; the live window decides upcoming vs. active regardless.">
        <option value="draft">Draft (hidden)</option>
        <option value="scheduled">Scheduled (published)</option>
        <option value="active">Active (published)</option>
        <option value="ended">Ended (published)</option>
      </Select>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Create event
        </Button>
      </div>
    </form>
  );
}
