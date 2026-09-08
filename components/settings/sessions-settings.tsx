"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { SectionLabel } from "../ui/security-primitives";
import { Badge } from "../ui/badge";
import { revokeAllOtherSessionsAction, revokeMySessionAction } from "../../actions/mfa";
import { formatDateTime } from "../../lib/format-date";
import type { MySession } from "../../services/mfa";

/**
 * Real GoTrue session rows (auth.sessions), never an invented device concept -- see
 * docs/decisions/0052. "Revoke" deletes the row; the next time that session's refresh
 * token is used, GoTrue rejects it -- a real, immediate sign-out of that device.
 */
export function SessionsSettings({ sessions: initialSessions }: { sessions: MySession[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRevoke(sessionId: string) {
    setError(null);
    setRevokingId(sessionId);
    startTransition(async () => {
      const result = await revokeMySessionAction({ sessionId });
      if (!result.ok) {
        setError(result.message);
        setRevokingId(null);
        return;
      }
      setSessions((current) => current.filter((s) => s.id !== sessionId));
    });
  }

  function handleRevokeAllOthers() {
    setError(null);
    startTransition(async () => {
      const result = await revokeAllOtherSessionsAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSessions((current) => current.filter((s) => s.isCurrent));
    });
  }

  const otherSessionCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="space-y-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionLabel>Sessions</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Every device currently signed in to your account.</p>
        </div>
        {otherSessionCount > 0 && (
          <Button variant="secondary" pending={pending} onClick={handleRevokeAllOthers}>
            Sign out all other devices
          </Button>
        )}
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                {session.userAgent ?? "Unknown device"}
                {session.isCurrent && <Badge className="text-success">This device</Badge>}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {session.ip ? `${session.ip} · ` : ""}
                Last active {formatDateTime(session.updatedAt)}
              </p>
            </div>
            {!session.isCurrent && (
              <Button variant="secondary" pending={pending && revokingId === session.id} onClick={() => handleRevoke(session.id)}>
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
