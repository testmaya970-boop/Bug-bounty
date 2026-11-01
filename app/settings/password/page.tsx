import React from "react";
import { ChangePasswordForm } from "../../../components/settings/change-password-form";
import { ChangeEmailForm } from "../../../components/settings/change-email-form";
import { getCurrentUser } from "../../../lib/auth/current-user";

export default async function EmailAndPasswordSettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Email & Password</h1>
        <p className="mt-1 text-sm text-ink-muted">Update your sign-in credentials.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Password</h2>
        <ChangePasswordForm email={user.email ?? ""} />
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-ink">Email address</h2>
        <ChangeEmailForm currentEmail={user.email ?? ""} />
      </section>
    </div>
  );
}
