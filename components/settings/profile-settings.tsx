"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { updateMyBiographyAction, updateMyDisplayNameAction } from "../../actions/researcher-profiles";

/**
 * The real, minimal self-service identity every account type shares -- display name
 * (public.users) and a biography (public.researcher_profiles, real schema that existed
 * but was completely unreachable before docs/decisions/0049). No avatar upload (a
 * disclosed, deferred capability -- see that same doc), no skills/certifications/
 * location/social links: this product's own repeated "no invented social metrics" rule
 * applies here too.
 */
export function ProfileSettings({
  initialDisplayName,
  initialBiography,
  researcherFields = true,
}: {
  initialDisplayName: string;
  initialBiography: string;
  /** false for an organization account: a biography "shown to organizations reviewing
   * your reports" and a public researcher profile do not apply to it. */
  researcherFields?: boolean;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [biography, setBiography] = useState(initialBiography);
  const [nameError, setNameError] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [bioSaved, setBioSaved] = useState(false);
  const [namePending, startNameTransition] = useTransition();
  const [bioPending, startBioTransition] = useTransition();

  function handleSaveName(event: React.FormEvent) {
    event.preventDefault();
    setNameError(null);
    setNameSaved(false);
    startNameTransition(async () => {
      const result = await updateMyDisplayNameAction({ displayName });
      if (!result.ok) {
        setNameError(result.message);
        return;
      }
      setNameSaved(true);
      router.refresh();
    });
  }

  function handleSaveBio(event: React.FormEvent) {
    event.preventDefault();
    setBioError(null);
    setBioSaved(false);
    startBioTransition(async () => {
      const result = await updateMyBiographyAction({ biography });
      if (!result.ok) {
        setBioError(result.message);
        return;
      }
      setBioSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <form className="space-y-3" onSubmit={handleSaveName}>
        <SectionLabel>Display name</SectionLabel>
        <p className="text-sm text-ink-muted">
          {researcherFields ? "Shown on your reports and to organizations you research for." : "Shown to your team, and to researchers on every message you send them about a report."}
        </p>
        <Input
          label="Display name"
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
            setNameSaved(false);
          }}
          maxLength={100}
          error={nameError ?? undefined}
        />
        {nameSaved && <Alert tone="success" title="Display name updated." />}
        <div className="flex justify-end">
          <Button type="submit" pending={namePending}>
            Save
          </Button>
        </div>
      </form>

      {researcherFields && (
        <>
          <form className="space-y-3 border-t border-border pt-6" onSubmit={handleSaveBio}>
            <SectionLabel>Biography</SectionLabel>
            <p className="text-sm text-ink-muted">Optional. Shown to organizations reviewing your reports.</p>
            <Textarea
              label="Biography"
              value={biography}
              onChange={(event) => {
                setBiography(event.target.value);
                setBioSaved(false);
              }}
              maxLength={5000}
              className="[&_textarea]:min-h-32"
              error={bioError ?? undefined}
            />
            {bioSaved && <Alert tone="success" title="Biography updated." />}
            <div className="flex justify-end">
              <Button type="submit" pending={bioPending}>
                Save
              </Button>
            </div>
          </form>

        </>
      )}
    </div>
  );
}
