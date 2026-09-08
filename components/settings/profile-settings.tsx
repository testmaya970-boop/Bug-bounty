"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Input, Textarea } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { updateMyBiographyAction, updateMyDisplayNameAction, setMyPublicUsernameAction } from "../../actions/researcher-profiles";

/**
 * The real, minimal self-service identity every account type shares -- display name
 * (public.users) and a biography (public.researcher_profiles, real schema that existed
 * but was completely unreachable before docs/decisions/0049). No avatar upload (a
 * disclosed, deferred capability -- see that same doc), no skills/certifications/
 * location/social links: this product's own repeated "no invented social metrics" rule
 * applies here too.
 *
 * The "Public profile" section (docs/decisions/0065) is new: setting a real,
 * collision-checked public username publishes display name, biography, stated focus
 * areas, and the real reputation score at /researchers/[username] -- an explicit,
 * opt-in action, never automatic. Clearing it (submitting empty) un-publishes the
 * profile without deleting anything else.
 */
export function ProfileSettings({
  initialDisplayName,
  initialBiography,
  initialPublicUsername,
}: {
  initialDisplayName: string;
  initialBiography: string;
  initialPublicUsername: string | null;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [biography, setBiography] = useState(initialBiography);
  const [publicUsername, setPublicUsername] = useState(initialPublicUsername ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [bioSaved, setBioSaved] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState<string | null>(null);
  const [namePending, startNameTransition] = useTransition();
  const [bioPending, startBioTransition] = useTransition();
  const [usernamePending, startUsernameTransition] = useTransition();

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

  function handleSaveUsername(event: React.FormEvent) {
    event.preventDefault();
    setUsernameError(null);
    setUsernameSaved(null);
    startUsernameTransition(async () => {
      const result = await setMyPublicUsernameAction({ username: publicUsername });
      if (!result.ok) {
        setUsernameError(result.message);
        return;
      }
      setUsernameSaved(publicUsername.trim() || null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <form className="space-y-3" onSubmit={handleSaveName}>
        <SectionLabel>Display name</SectionLabel>
        <p className="text-sm text-ink-muted">Shown on your reports and to organizations you research for.</p>
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

      <form className="space-y-3 border-t border-border pt-6" onSubmit={handleSaveUsername}>
        <SectionLabel>Public profile</SectionLabel>
        <p className="text-sm text-ink-muted">
          Optional. Choose a public username to publish a profile at /researchers/{"{username}"} showing your display name, biography, stated focus areas, and your real reputation score. Clear this field
          and save to unpublish it.
        </p>
        <Input
          label="Public username"
          placeholder="e.g. shiva-researches"
          value={publicUsername}
          onChange={(event) => {
            setPublicUsername(event.target.value);
            setUsernameSaved(null);
          }}
          maxLength={30}
          helperText="3-30 characters: lowercase letters, numbers, and hyphens only."
          error={usernameError ?? undefined}
        />
        {usernameSaved !== null && (
          <Alert tone="success" title="Public profile published.">
            <Link href={`/researchers/${usernameSaved}` as Route} className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              View your public profile →
            </Link>
          </Alert>
        )}
        {usernameSaved === null && publicUsername.trim() === "" && initialPublicUsername && <Alert tone="info" title="Saving with this field empty will unpublish your public profile." />}
        <div className="flex justify-end">
          <Button type="submit" pending={usernamePending}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
