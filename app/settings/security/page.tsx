import React from "react";
import { MfaSettings } from "../../../components/settings/mfa-settings";
import { SessionsSettings } from "../../../components/settings/sessions-settings";
import { listMyMfaFactors, listMySessions } from "../../../services/mfa";

export default async function AccountSecuritySettingsPage({ searchParams }: { searchParams: Promise<{ mfa?: string }> }) {
  const [mfaFactors, sessions, { mfa }] = await Promise.all([listMyMfaFactors(), listMySessions(), searchParams]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Account Security</h1>
        <p className="mt-1 text-sm text-ink-muted">Two-factor authentication and every device currently signed in.</p>
      </div>
      {mfa === "required" && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Platform administrators must turn on two-factor authentication. Set it up below to continue.
        </p>
      )}
      <MfaSettings factors={mfaFactors} />
      <SessionsSettings sessions={sessions} />
    </div>
  );
}
