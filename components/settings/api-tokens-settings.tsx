"use client";

import React, { useState, useTransition } from "react";
import { Input } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { createMyApiTokenAction, revokeMyApiTokenAction } from "../../actions/api-tokens";
import type { ApiToken } from "../../services/api-tokens";
import { LocalTime } from "../ui/local-time";

/** Real personal access tokens (public.personal_access_tokens) -- generated server-side,
 * shown in plaintext exactly once. No endpoint currently accepts one for authentication
 * yet -- disclosed honestly below, not implied to work. See docs/decisions/0055.
 *
 * The list is local state, updated immediately from the real server action's own
 * response -- never a `router.refresh()` round-trip the user has to wait on before
 * seeing their own action reflected (docs/decisions/0055.1). */
export function ApiTokensSettings({ tokens: initialTokens }: { tokens: ApiToken[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createMyApiTokenAction({ name });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCreatedToken(result.data.token);
      setTokens((current) => [{ id: result.data.id, name, createdAt: new Date().toISOString(), lastUsedAt: null }, ...current]);
      setName("");
    });
  }

  function handleRevoke(id: string) {
    setError(null);
    setRevokingId(id);
    startTransition(async () => {
      const result = await revokeMyApiTokenAction({ id });
      if (!result.ok) {
        setError(result.message);
        setRevokingId(null);
        return;
      }
      setTokens((current) => current.filter((t) => t.id !== id));
    });
  }

  return (
    <div className="space-y-6">
      <Alert tone="info" title="Currently accepted by one endpoint">
        Personal access tokens are real and stored securely (only their hash is kept). <code>GET /api/v1/reports</code> accepts one today, via an <code>Authorization: Bearer</code> header. The rest of the API surface does not exist yet.
      </Alert>

      <form className="flex items-end gap-2" onSubmit={handleCreate}>
        <Input label="Token name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="flex-1" placeholder="e.g. Local CLI" />
        <Button type="submit" pending={pending}>
          Generate token
        </Button>
      </form>

      {createdToken && (
        <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <Alert tone="success" title="Save this token now">
            It will never be shown again.
          </Alert>
          <p className="break-all rounded-md border border-border bg-surface-muted p-3 font-mono text-sm">{createdToken}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {tokens.length === 0 && <li className="p-4 text-sm text-ink-muted">No tokens yet.</li>}
        {tokens.map((token) => (
          <li key={token.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{token.name}</p>
              <p className="mt-0.5 text-xs text-ink-muted">Created <LocalTime value={token.createdAt} />{token.lastUsedAt ? <> · Last used <LocalTime value={token.lastUsedAt} /></> : " · Never used"}</p>
            </div>
            <Button variant="secondary" pending={pending && revokingId === token.id} onClick={() => handleRevoke(token.id)}>
              Revoke
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
