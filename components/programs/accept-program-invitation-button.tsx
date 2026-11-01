"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { acceptProgramInvitationAction } from "../../actions/program-researchers";

type Result = { ok: true; organizationId: string; programId: string } | { ok: false; message: string };

export function AcceptProgramInvitationButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  function handleAccept() {
    startTransition(async () => {
      const response = await acceptProgramInvitationAction(token);
      setResult(response.ok ? { ok: true, organizationId: response.data.organizationId, programId: response.data.programId } : { ok: false, message: response.message });
    });
  }

  if (result?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Invitation accepted">
          You&apos;re now an authorized researcher for this program.
        </Alert>
        <Link prefetch={false} href={`/organizations/${result.organizationId}/programs/${result.programId}` as Route} className="text-sm font-semibold text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Go to the program →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">You&apos;ve been invited to participate in an Unpatched program.</p>
      {result && !result.ok && (
        <p role="alert" className="text-sm font-medium text-danger">
          {result.message}
        </p>
      )}
      <Button pending={pending} onClick={handleAccept}>
        Accept invitation
      </Button>
    </div>
  );
}
