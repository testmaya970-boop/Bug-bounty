import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { ProfessionalDetailsSettings } from "../../../components/settings/professional-details-settings";
import { getMyProfessionalDetails } from "../../../services/researcher-profiles";
import { getCurrentUser } from "../../../lib/auth/current-user";

export default async function SkillsSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/settings/skills" as Route);

  const professionalDetails = await getMyProfessionalDetails(user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Skills & Interests</h1>
        <p className="mt-1 text-sm text-ink-muted">Used to recommend relevant programs to you. Never shared as a ranking or score.</p>
      </div>
      <ProfessionalDetailsSettings
        initial={professionalDetails ?? { qualification: null, experienceLevel: null, employmentStatus: null, linkedinUrl: null, resumeUrl: null, hackingInterests: [], hackingTools: [], securityFocus: [] }}
      />
    </div>
  );
}
