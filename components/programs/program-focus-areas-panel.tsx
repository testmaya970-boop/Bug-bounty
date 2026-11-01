"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Panel } from "../ui/feedback";
import { CheckboxGroup } from "../ui/form";
import { setProgramFocusAreasAction } from "../../actions/programs";
import { FOCUS_AREA_ORDER, focusAreaLabel } from "../../lib/researcher-identity-labels";
import type { ResearcherFocusArea } from "../../types/researcher-identity";

const FOCUS_AREA_LABELS = Object.fromEntries(FOCUS_AREA_ORDER.map((v) => [v, focusAreaLabel(v)])) as Record<ResearcherFocusArea, string>;

/**
 * Tags this program with the focus areas it's actually meant for -- the one piece of data
 * list_recommended_programs matches against a researcher's own declared interests (see
 * docs/decisions/0051). Independent of lifecycle status, same reasoning as
 * ProgramVisibilityPanel: metadata, not scope, so it can be set at any stage.
 */
export function ProgramFocusAreasPanel({ organizationId, programId, focusAreas }: { organizationId: string; programId: string; focusAreas: ResearcherFocusArea[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ResearcherFocusArea[]>(focusAreas);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await setProgramFocusAreasAction({ organizationId, programId, focusAreas: selected });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Panel className="space-y-4 p-5">
      <CheckboxGroup
        legend="Focus areas"
        helperText="Recommends this program to researchers whose declared interests overlap. It is a real, literal match, not a paid placement."
        options={FOCUS_AREA_ORDER}
        labels={FOCUS_AREA_LABELS}
        values={selected}
        onChange={setSelected}
      />
      <Button variant="secondary" onClick={handleSave} pending={pending}>
        Save focus areas
      </Button>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </Panel>
  );
}
