"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Input, Select, Textarea } from "../ui/form";
import { Alert } from "../ui/feedback";
import { CaptchaField, type CaptchaClientConfig } from "../auth/captcha-field";
import { submitContactRequestAction } from "../../actions/contact";

type Topic = "launch_program" | "pricing" | "security" | "partnership" | "other";
type Field = "name" | "email" | "company" | "website" | "message";

export function ContactForm({ topics, captcha }: { topics: Record<Topic, string>; captcha: CaptchaClientConfig }) {
  const [form, setForm] = useState({ name: "", email: "", company: "", website: "", topic: "launch_program" as Topic, message: "", fax: "" });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<{ field?: Field; message: string } | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const fieldError = (field: Field) => (error?.field === field ? error.message : undefined);

  if (sent) {
    return (
      <Alert tone="success" title="Message received.">
        We reply from a real person within one business day, to {form.email}.
      </Alert>
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitContactRequestAction({ ...form, captchaToken: captchaToken ?? undefined });
      if (!result.ok) setError({ field: result.field, message: result.message });
      else setSent(true);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Your name" required autoComplete="name" value={form.name} onChange={set("name")} maxLength={120} error={fieldError("name")} />
        <Input label="Work email" required type="email" autoComplete="email" value={form.email} onChange={set("email")} maxLength={254} error={fieldError("email")} />
        <Input label="Company" required autoComplete="organization" value={form.company} onChange={set("company")} maxLength={160} error={fieldError("company")} />
        <Input label="Website" helperText="Optional." type="url" autoComplete="url" placeholder="https://" value={form.website} onChange={set("website")} maxLength={300} error={fieldError("website")} />
      </div>
      <Select label="What is this about?" value={form.topic} onChange={set("topic")}>
        {(Object.keys(topics) as Topic[]).map((t) => (
          <option key={t} value={t}>
            {topics[t]}
          </option>
        ))}
      </Select>
      <Textarea label="Message" required value={form.message} onChange={set("message")} maxLength={4000} className="[&_textarea]:min-h-36" helperText="What you run, what you want tested, and your timeline." error={fieldError("message")} />
      {/* Honeypot: off-screen and out of the tab order, so only bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Fax
          <input tabIndex={-1} autoComplete="off" value={form.fax} onChange={set("fax")} />
        </label>
      </div>
      <CaptchaField config={captcha} onToken={setCaptchaToken} />
      {error && !error.field && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error.message}
        </p>
      )}
      <Button type="submit" pending={pending} className="w-full justify-center sm:w-auto">
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
