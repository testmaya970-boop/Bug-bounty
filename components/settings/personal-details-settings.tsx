"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { updateMyPersonalDetailsAction } from "../../actions/researcher-profiles";
import { AGE_GROUP_ORDER, GENDER_ORDER, ageGroupLabel, genderLabel } from "../../lib/researcher-identity-labels";
import type { PersonalDetails, ResearcherAgeGroup, ResearcherGender } from "../../types/researcher-identity";

/**
 * Gender/age group -- deliberately NOT on the public-read researcher_profiles table
 * (biography/professional details live there): a new self-only table
 * (researcher_personal_details) keeps this out of any organization's reach. See
 * docs/decisions/0051.
 */
export function PersonalDetailsSettings({ initial }: { initial: PersonalDetails }) {
  const router = useRouter();
  const [gender, setGender] = useState<ResearcherGender | "">(initial.gender ?? "");
  const [ageGroup, setAgeGroup] = useState<ResearcherAgeGroup | "">(initial.ageGroup ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateMyPersonalDetailsAction({ gender: gender || undefined, ageGroup: ageGroup || undefined });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form className="space-y-4 border-t border-border pt-6" onSubmit={handleSubmit}>
      <div>
        <SectionLabel>Personal details</SectionLabel>
        <p className="mt-1 text-sm text-ink-muted">Private. Never shown to any organization.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Gender" value={gender} onChange={(event) => setGender(event.target.value as ResearcherGender | "")}>
          <option value="">Prefer not to say</option>
          {GENDER_ORDER.map((value) => (
            <option key={value} value={value}>
              {genderLabel(value)}
            </option>
          ))}
        </Select>
        <Select label="Age group" value={ageGroup} onChange={(event) => setAgeGroup(event.target.value as ResearcherAgeGroup | "")}>
          <option value="">Not set</option>
          {AGE_GROUP_ORDER.map((value) => (
            <option key={value} value={value}>
              {ageGroupLabel(value)}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && <Alert tone="success" title="Personal details updated." />}
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
