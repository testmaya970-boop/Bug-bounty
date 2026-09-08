import React from "react";
import { redirect } from "next/navigation";
import { AuthLayout } from "../../components/auth/auth-layout";
import { ForgotPasswordForm } from "../../components/auth/forgot-password-form";
import { getCurrentUser } from "../../lib/auth/current-user";

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect("/organizations");

  return (
    <AuthLayout eyebrow="Unpatched" title="Reset your password" description="Enter your email and we'll send you a link to choose a new password.">
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
