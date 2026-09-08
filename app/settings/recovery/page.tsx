import React from "react";
import { AccountRecoverySettings } from "../../../components/settings/account-recovery-settings";
import { getMyMfaStatus } from "../../../services/mfa";

export default async function AccountRecoverySettingsPage() {
  const status = await getMyMfaStatus();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Account Recovery</h1>
        <p className="mt-1 text-sm text-ink-muted">Backup codes for signing in if you lose access to your authenticator app.</p>
      </div>
      <AccountRecoverySettings totpEnrolled={status.totpEnrolled} remainingBackupCodes={status.remainingBackupCodes} />
    </div>
  );
}
