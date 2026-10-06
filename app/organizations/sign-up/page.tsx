import React from "react";
import { redirect } from "next/navigation";
import { AuthLayout } from "../../../components/auth/auth-layout";
import { SignUpForm } from "../../../components/auth/sign-up-form";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { activeEmailProvider } from "../../../lib/email-provider";

export default async function OrganizationSignUpPage() {
  const user = await getCurrentUser();
  if (user) redirect("/organizations");

  return (
    <AuthLayout eyebrow="Organization" title="Create your organization account" description="Create programs, define scope, and triage reports. You'll create your organization next." variant="organization">
      <SignUpForm intent="organization" emailIsSimulated={activeEmailProvider.name === "dev"} />
    </AuthLayout>
  );
}
