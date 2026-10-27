import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "../../../components/auth/auth-layout";
import { SignUpForm } from "../../../components/auth/sign-up-form";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { activeEmailProvider } from "../../../lib/email-provider";
import { isSafeRedirect } from "../../../lib/auth/safe-redirect";
import { captchaConfig } from "../../../lib/integrations/captcha";

export default async function OrganizationSignUpPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  const { redirectTo: requested } = await searchParams;
  const redirectTo = isSafeRedirect(requested) ? requested : undefined;
  const user = await getCurrentUser();
  if (user) redirect("/organizations");

  return (
    <AuthLayout eyebrow="Organization" title="Create your organization account" description="Create programs, define scope, and triage reports. You'll create your organization next." variant="organization">
      <SignUpForm intent="organization" emailIsSimulated={activeEmailProvider.name === "dev"} redirectTo={redirectTo} captcha={captchaConfig()} />
      <p className="mt-6 text-center text-sm text-ink-muted">
        Want to talk first?{" "}
        <Link prefetch={false} href={"/contact" as Route} className="font-medium text-action underline underline-offset-2">
          Contact us
        </Link>
      </p>
    </AuthLayout>
  );
}
