"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/form";
import { Alert } from "../ui/feedback";
import { saveServiceNowAction, createServiceNowTicketAction } from "../../actions/servicenow";

export function ServiceNowForm({ organizationId, initial }: { organizationId: string; initial: { instanceUrl: string; username: string; tableName: "incident" | "sn_si_incident"; assignmentGroup: string | null } | null }) {
  const router = useRouter();
  const [instanceUrl, setInstanceUrl] = useState(initial?.instanceUrl ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [tableName, setTableName] = useState<"incident" | "sn_si_incident">(initial?.tableName ?? "incident");
  const [assignmentGroup, setAssignmentGroup] = useState(initial?.assignmentGroup ?? "");
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await saveServiceNowAction({ organizationId, instanceUrl, username, password, tableName, assignmentGroup });
          if (!r.ok) return setError(r.message);
          setSecret(r.secret ?? null);
          setPassword("");
          router.refresh();
        });
      }}
    >
      {secret && (
        <Alert tone="warning" title="Save this token in ServiceNow now. It won't be shown again.">
          <p className="mt-1">Create a system property named unpatched.webhook_token with this value; the Business Rule below sends it.</p>
          <code className="mt-2 block break-all rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-ink">{secret}</code>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Instance" placeholder="https://yourcompany.service-now.com" value={instanceUrl} onChange={(e) => setInstanceUrl(e.target.value)} required />
        <Select label="Create records in" value={tableName} onChange={(e) => setTableName(e.target.value as "incident" | "sn_si_incident")}>
          <option value="incident">Incident (incident)</option>
          <option value="sn_si_incident">Security Incident Response (sn_si_incident)</option>
        </Select>
        <Input label="Integration user" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <Input label="Password" type="password" autoComplete="new-password" helperText={initial ? "Enter it again to save changes." : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Input label="Assignment group" helperText="Optional: sys_id or name." value={assignmentGroup} onChange={(e) => setAssignmentGroup(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" pending={pending}>
        {initial ? "Test and save" : "Test and connect"}
      </Button>
    </form>
  );
}

export function CreateServiceNowTicketButton({ organizationId, programId, reportId }: { organizationId: string; programId: string; reportId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        pending={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await createServiceNowTicketAction(organizationId, programId, reportId);
            if (!r.ok) return setError(r.message);
            router.refresh();
          })
        }
      >
        Create ServiceNow ticket
      </Button>
      {error && (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
