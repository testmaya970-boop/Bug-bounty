import React from "react";
import { redirect } from "next/navigation";
import { AuthLayout } from "../../components/auth/auth-layout";
import { ForgotPasswordForm } from "../../components/auth/forgot-password-form";
import { getCurrentUser } from "../../lib/auth/current-user";

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  // Signed in already: home, which routes each account type to its own start page (a
  // researcher used to be sent to /organizations).
  if (user) redirect("/");

  return (
    <AuthLayout eyebrow="Unpatched" title="Reset your password" description="Enter your email and we'll send you a link to choose a new password.">
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
