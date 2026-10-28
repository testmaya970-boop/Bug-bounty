"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Select, Checkbox } from "../ui/form";
import { Alert } from "../ui/feedback";
import {
  createWebhookAction,
  updateWebhookAction,
  rotateWebhookSecretAction,
  createChatConnectionAction,
  updateChatConnectionAction,
  startSlackInstallAction,
} from "../../actions/org-integrations";

type Program = { id: string; name: string };
type Option = { value: string; label: string };

function Checkboxes({ name, options, selected, onChange }: { name: string; options: Option[]; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-medium text-ink">{name}</legend>
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {options.map((o) => (
          <Checkbox key={o.value} label={o.label} checked={selected.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((s) => s !== o.value))} />
        ))}
      </div>
    </fieldset>
  );
}

function ProgramSelect({ programs, value, onChange }: { programs: Program[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select label="Programs" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All programs</option>
      {programs.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}

/** The signing secret, shown exactly once. */
export function SecretReveal({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert tone="warning" title="Copy the signing secret now. It won't be shown again.">
      <div className="mt-2 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-ink">{secret}</code>
        <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(secret).then(() => setCopied(true))}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Alert>
  );
}

export function WebhookForm({
  organizationId,
  programs,
  events,
  existing,
}: {
  organizationId: string;
  programs: Program[];
  events: Option[];
  existing?: { id: string; url: string; description: string | null; eventTypes: string[]; programId: string | null; status: "active" | "paused" | "disabled" };
}) {
  const router = useRouter();
  const [url, setUrl] = useState(existing?.url ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [eventTypes, setEventTypes] = useState<string[]>(existing?.eventTypes ?? ["report.created", "report.accepted", "report.resolved"]);
  const [programId, setProgramId] = useState(existing?.programId ?? "");
  const [status, setStatus] = useState<"active" | "paused">(existing?.status === "paused" ? "paused" : "active");
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const input = { organizationId, url, description, eventTypes, programId: programId || null };
      const result = existing ? await updateWebhookAction({ ...input, endpointId: existing.id, status }) : await createWebhookAction(input);
      if (!result.ok) return setError(result.message);
      if (result.secret) setSecret(result.secret);
      if (!existing) {
        setUrl("");
        setDescription("");
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {secret && <SecretReveal secret={secret} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Endpoint URL" type="url" placeholder="https://siem.example.com/unpatched" value={url} onChange={(e) => setUrl(e.target.value)} required maxLength={2000} />
        <Input label="Description" helperText="Optional." value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
      </div>
      <Checkboxes name="Events" options={events} selected={eventTypes} onChange={setEventTypes} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ProgramSelect programs={programs} value={programId} onChange={setProgramId} />
        {existing && (
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as "active" | "paused")}>
            <option value="active">Active{existing.status === "disabled" ? " (turn back on)" : ""}</option>
            <option value="paused">Paused</option>
          </Select>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && existing && (
        <p role="status" className="text-sm font-medium text-success">
          Saved.
        </p>
      )}
      <Button type="submit" pending={pending}>
        {existing ? "Save endpoint" : "Add endpoint"}
      </Button>
    </form>
  );
}

export function RotateSecretButton({ organizationId, endpointId }: { organizationId: string; endpointId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      {secret && <SecretReveal secret={secret} />}
      <Button
        variant="secondary"
        pending={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await rotateWebhookSecretAction(organizationId, endpointId);
            if (!r.ok) setError(r.message);
            else if ("secret" in r && r.secret) setSecret(r.secret);
          })
        }
      >
        Rotate secret
      </Button>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const ALERT_OPTIONS: Option[] = [
  { value: "new_report", label: "New reports" },
  { value: "critical", label: "Critical findings" },
  { value: "status_change", label: "Status changes" },
  { value: "sla_breach", label: "SLA breaches" },
];

export function ChatConnectionForm({ organizationId, provider, programs }: { organizationId: string; provider: "slack" | "teams"; programs: Program[] }) {
  const router = useRouter();
  const [label, setLabel] = useState(provider === "slack" ? "Slack #security" : "Teams Security channel");
  const [url, setUrl] = useState("");
  const [alerts, setAlerts] = useState<string[]>(["new_report", "critical", "sla_breach"]);
  const [programId, setProgramId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await createChatConnectionAction({ organizationId, provider, label, url, alerts, programId: programId || null });
          if (!r.ok) return setError(r.message);
          setUrl("");
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Name" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
        <Input
          label={provider === "slack" ? "Slack incoming webhook URL" : "Teams Workflows URL"}
          type="url"
          placeholder={provider === "slack" ? "https://hooks.slack.com/services/..." : "https://...logic.azure.com/workflows/..."}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </div>
      <Checkboxes name="Send" options={ALERT_OPTIONS} selected={alerts} onChange={setAlerts} />
      <ProgramSelect programs={programs} value={programId} onChange={setProgramId} />
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" pending={pending}>
        Connect {provider === "slack" ? "Slack" : "Teams"}
      </Button>
    </form>
  );
}

export function ChatConnectionEditor({ organizationId, connection, programs }: { organizationId: string; connection: { id: string; alerts: string[]; programId: string | null; status: "active" | "paused" | "disabled" }; programs: Program[] }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState(connection.alerts);
  const [programId, setProgramId] = useState(connection.programId ?? "");
  const [status, setStatus] = useState<"active" | "paused">(connection.status === "paused" ? "paused" : "active");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        startTransition(async () => {
          const r = await updateChatConnectionAction({ organizationId, connectionId: connection.id, alerts, programId: programId || null, status });
          setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.message });
          if (r.ok) router.refresh();
        });
      }}
    >
      <Checkboxes name="Send" options={ALERT_OPTIONS} selected={alerts} onChange={setAlerts} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ProgramSelect programs={programs} value={programId} onChange={setProgramId} />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as "active" | "paused")}>
          <option value="active">Active{connection.status === "disabled" ? " (turn back on)" : ""}</option>
          <option value="paused">Paused</option>
        </Select>
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm font-medium ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
      <Button type="submit" variant="secondary" pending={pending}>
        Save
      </Button>
    </form>
  );
}

export function AddToSlackButton({ organizationId }: { organizationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        pending={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await startSlackInstallAction(organizationId);
            if (!r.ok) return setError(r.message);
            window.location.assign(r.url);
          })
        }
      >
        Add to Slack
      </Button>
      {error && (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
