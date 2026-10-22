import React from "react";
import { redirect } from "next/navigation";
import { AuthLayout } from "../../../components/auth/auth-layout";
import { SignUpForm } from "../../../components/auth/sign-up-form";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { activeEmailProvider } from "../../../lib/email-provider";
import { isSafeRedirect } from "../../../lib/auth/safe-redirect";
import { captchaConfig } from "../../../lib/integrations/captcha";

export default async function ResearcherSignUpPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  const { redirectTo: requested } = await searchParams;
  const redirectTo = isSafeRedirect(requested) ? requested : undefined;
  const user = await getCurrentUser();
  if (user) redirect("/programs");

  return (
    <AuthLayout eyebrow="Researcher" title="Create your researcher account" description="Find programs, submit vulnerabilities, and track your work." variant="researcher">
      <SignUpForm intent="researcher" emailIsSimulated={activeEmailProvider.name === "dev"} redirectTo={redirectTo} captcha={captchaConfig()} />
    </AuthLayout>
  );
}
