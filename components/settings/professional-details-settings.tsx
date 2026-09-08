"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, CheckboxGroup } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { updateMyProfessionalDetailsAction } from "../../actions/researcher-profiles";
import { EXPERIENCE_LEVEL_ORDER, EMPLOYMENT_STATUS_ORDER, FOCUS_AREA_ORDER, TOOL_CATEGORY_ORDER, SECURITY_FOCUS_ORDER, experienceLevelLabel, employmentStatusLabel, focusAreaLabel, toolCategoryLabel, securityFocusLabel } from "../../lib/researcher-identity-labels";
import type { ProfessionalDetails, ResearcherEmploymentStatus, ResearcherExperienceLevel, ResearcherFocusArea, ResearcherSecurityFocus, ResearcherToolCategory } from "../../types/researcher-identity";

const FOCUS_AREA_LABELS = Object.fromEntries(FOCUS_AREA_ORDER.map((v) => [v, focusAreaLabel(v)])) as Record<ResearcherFocusArea, string>;
const TOOL_CATEGORY_LABELS = Object.fromEntries(TOOL_CATEGORY_ORDER.map((v) => [v, toolCategoryLabel(v)])) as Record<ResearcherToolCategory, string>;
const SECURITY_FOCUS_LABELS = Object.fromEntries(SECURITY_FOCUS_ORDER.map((v) => [v, securityFocusLabel(v)])) as Record<ResearcherSecurityFocus, string>;

/**
 * Professional details + interests -- the same public-read tier as biography (an
 * organization triaging a report can see these, same as they already see the bio). The
 * interests/tools/security-focus checklists exist to power a real recommendation feature
 * (list_recommended_programs -- a literal focus_areas overlap, never a fabricated "AI
 * model"), not as a credibility flex -- see docs/decisions/0051.
 */
export function ProfessionalDetailsSettings({ initial }: { initial: ProfessionalDetails }) {
  const router = useRouter();
  const [qualification, setQualification] = useState(initial.qualification ?? "");
  const [experienceLevel, setExperienceLevel] = useState<ResearcherExperienceLevel | "">(initial.experienceLevel ?? "");
  const [employmentStatus, setEmploymentStatus] = useState<ResearcherEmploymentStatus | "">(initial.employmentStatus ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(initial.linkedinUrl ?? "");
  const [resumeUrl, setResumeUrl] = useState(initial.resumeUrl ?? "");
  const [hackingInterests, setHackingInterests] = useState<ResearcherFocusArea[]>(initial.hackingInterests);
  const [hackingTools, setHackingTools] = useState<ResearcherToolCategory[]>(initial.hackingTools);
  const [securityFocus, setSecurityFocus] = useState<ResearcherSecurityFocus[]>(initial.securityFocus);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateMyProfessionalDetailsAction({
        qualification: qualification || undefined,
        experienceLevel: experienceLevel || undefined,
        employmentStatus: employmentStatus || undefined,
        linkedinUrl: linkedinUrl || undefined,
        resumeUrl: resumeUrl || undefined,
        hackingInterests,
        hackingTools,
        securityFocus,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form className="space-y-5 border-t border-border pt-6" onSubmit={handleSubmit}>
      <div>
        <SectionLabel>About you</SectionLabel>
        <p className="mt-1 text-sm text-ink-muted">Shown to organizations reviewing your reports.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Qualification" value={qualification} onChange={(event) => setQualification(event.target.value)} maxLength={200} placeholder="e.g. Undergraduate" />
        <Select label="Hacking experience level" value={experienceLevel} onChange={(event) => setExperienceLevel(event.target.value as ResearcherExperienceLevel | "")}>
          <option value="">Not set</option>
          {EXPERIENCE_LEVEL_ORDER.map((level) => (
            <option key={level} value={level}>
              {experienceLevelLabel(level)}
            </option>
          ))}
        </Select>
        <Select label="Current status" value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value as ResearcherEmploymentStatus | "")}>
          <option value="">Not set</option>
          {EMPLOYMENT_STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {employmentStatusLabel(status)}
            </option>
          ))}
        </Select>
        <Input label="LinkedIn" value={linkedinUrl} onChange={(event) => setLinkedinUrl(event.target.value)} maxLength={300} placeholder="https://www.linkedin.com/in/username" />
        <Input label="Resume / portfolio link" className="sm:col-span-2" value={resumeUrl} onChange={(event) => setResumeUrl(event.target.value)} maxLength={500} placeholder="https://drive.google.com/..." />
      </div>

      <CheckboxGroup legend="What are your hacking interests?" helperText="Used to recommend relevant programs to you. It is never shared as a ranking or score." options={FOCUS_AREA_ORDER} labels={FOCUS_AREA_LABELS} values={hackingInterests} onChange={setHackingInterests} />
      <CheckboxGroup legend="What tools do you use?" options={TOOL_CATEGORY_ORDER} labels={TOOL_CATEGORY_LABELS} values={hackingTools} onChange={setHackingTools} />
      <CheckboxGroup legend="What is your security focus?" options={SECURITY_FOCUS_ORDER} labels={SECURITY_FOCUS_LABELS} values={securityFocus} onChange={setSecurityFocus} />

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && <Alert tone="success" title="About you updated." />}
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
