"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Select, Textarea, Checkbox } from "../ui/form";
import { SecretReveal } from "./integration-forms";
import { saveSsoAction, setSsoStateAction, rotateScimTokenAction } from "../../actions/sso";

type Existing = { idpEntityId: string; idpSsoUrl: string; allowJit: boolean; defaultRole: string; roleAttribute: string | null; roleMappings: Record<string, string> } | null;

export function SsoConfigForm({ organizationId, existing }: { organizationId: string; existing: Existing }) {
  const router = useRouter();
  const [idpEntityId, setEntity] = useState(existing?.idpEntityId ?? "");
  const [idpSsoUrl, setUrl] = useState(existing?.idpSsoUrl ?? "");
  const [idpCertificate, setCert] = useState("");
  const [allowJit, setJit] = useState(existing?.allowJit ?? true);
  const [defaultRole, setRole] = useState(existing?.defaultRole ?? "triager");
  const [roleAttribute, setAttr] = useState(existing?.roleAttribute ?? "");
  const [roleMappings, setMappings] = useState(Object.entries(existing?.roleMappings ?? {}).map(([g, r]) => `${g}=${r}`).join("\n"));
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
          const r = await saveSsoAction({ organizationId, idpEntityId, idpSsoUrl, idpCertificate, allowJit, defaultRole: defaultRole as "triager", roleAttribute, roleMappings });
          setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.message });
          if (r.ok) {
            setCert("");
            router.refresh();
          }
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Identity provider entity ID (issuer)" value={idpEntityId} onChange={(e) => setEntity(e.target.value)} required />
        <Input label="Single sign-on URL" type="url" placeholder="https://idp.example.com/saml/sso" value={idpSsoUrl} onChange={(e) => setUrl(e.target.value)} required />
      </div>
      <Textarea label="Signing certificate" helperText={existing ? "Paste it again to save changes (PEM or base64)." : "PEM or base64, from your identity provider's SAML app."} value={idpCertificate} onChange={(e) => setCert(e.target.value)} className="[&_textarea]:font-mono [&_textarea]:text-xs" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label="Role for new people" value={defaultRole} onChange={(e) => setRole(e.target.value)}>
          <option value="triager">Triager</option>
          <option value="program_manager">Program manager</option>
          <option value="security_admin">Security admin</option>
          <option value="billing_admin">Billing admin</option>
        </Select>
        <Checkbox label="Create accounts for new people on first sign-in" checked={allowJit} onChange={(e) => setJit(e.target.checked)} />
        <Input label="Group attribute" helperText="Optional, e.g. groups. Used for role mapping." value={roleAttribute} onChange={(e) => setAttr(e.target.value)} />
        <Textarea label="Role mapping" helperText="One per line: group=role. Owner is never granted." value={roleMappings} onChange={(e) => setMappings(e.target.value)} className="[&_textarea]:font-mono [&_textarea]:text-xs" />
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm font-medium ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
      <Button type="submit" pending={pending}>
        Save single sign-on
      </Button>
    </form>
  );
}

export function SsoStateControls({ organizationId, active, enforced }: { organizationId: string; active: boolean; enforced: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const go = (a: boolean, e: boolean) =>
    startTransition(async () => {
      setError(null);
      const r = await setSsoStateAction(organizationId, a, e);
      if (!r.ok) return setError(r.message);
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!active && (
          <Button pending={pending} onClick={() => go(true, false)}>
            Turn on single sign-on
          </Button>
        )}
        {active && !enforced && (
          <Button variant="secondary" pending={pending} onClick={() => go(true, true)}>
            Require single sign-on
          </Button>
        )}
        {active && enforced && (
          <Button variant="secondary" pending={pending} onClick={() => go(true, false)}>
            Allow passwords again
          </Button>
        )}
        {active && (
          <Button variant="quiet" disabled={pending} onClick={() => go(false, false)}>
            Turn off
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function ScimTokenButton({ organizationId, hasToken }: { organizationId: string; hasToken: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      {token && <SecretReveal secret={token} />}
      <Button
        variant="secondary"
        pending={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await rotateScimTokenAction(organizationId);
            if (!r.ok) setError(r.message);
            else setToken(r.token ?? null);
          })
        }
      >
        {hasToken ? "Replace SCIM token" : "Create SCIM token"}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
