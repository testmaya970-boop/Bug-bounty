import React from "react";
import { MfaSettings } from "../../../components/settings/mfa-settings";
import { SessionsSettings } from "../../../components/settings/sessions-settings";
import { listMyMfaFactors, listMySessions } from "../../../services/mfa";

export default async function AccountSecuritySettingsPage() {
  const [mfaFactors, sessions] = await Promise.all([listMyMfaFactors(), listMySessions()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Account Security</h1>
        <p className="mt-1 text-sm text-ink-muted">Two-factor authentication and every device currently signed in.</p>
      </div>
      <MfaSettings factors={mfaFactors} />
      <SessionsSettings sessions={sessions} />
    </div>
  );
}
