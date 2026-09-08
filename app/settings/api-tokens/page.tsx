import React from "react";
import { ApiTokensSettings } from "../../../components/settings/api-tokens-settings";
import { listMyApiTokens } from "../../../services/api-tokens";

export default async function ApiTokensSettingsPage() {
  const tokens = await listMyApiTokens();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">API Token</h1>
        <p className="mt-1 text-sm text-ink-muted">Generate and manage personal access tokens.</p>
      </div>
      <ApiTokensSettings tokens={tokens} />
    </div>
  );
}
