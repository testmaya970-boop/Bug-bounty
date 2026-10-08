import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { EmailAliasSettings } from "../../../components/settings/email-alias-settings";
import { getMyEmailAlias } from "../../../services/email-alias";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { requireResearcherSettings } from "../../../lib/auth/account-type";

export default async function EmailAliasSettingsPage() {
  await requireResearcherSettings();
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/settings/email-alias" as Route);

  const alias = await getMyEmailAlias();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Email Alias</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Use this address when you create test accounts on a program&apos;s targets. Mail sent to it is forwarded to your account email, which the sender never sees, and
          organizations can tell your test accounts apart from real users.
        </p>
      </div>
      <EmailAliasSettings alias={alias} />
    </div>
  );
}
