"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Checkbox, Input, Select, Textarea } from "../ui/form";
import { publishProgramPolicyAction } from "../../actions/program-policy";
import type { ProgramDisclosureMode, ProgramPolicy } from "../../types/program-policy";

const toNumber = (value: string) => (value.trim() === "" ? null : Number(value));

/** Publishes a NEW policy version (earlier ones are kept, and every report stays bound to the
 * version it was submitted under). Pre-filled from the current version. */
export function PublishProgramPolicyDialog({ organizationId, programId, current }: { organizationId: string; programId: string; current: ProgramPolicy | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState(current?.rulesOfEngagement ?? "");
  const [safeHarbor, setSafeHarbor] = useState(current?.safeHarbor ?? true);
  const [mode, setMode] = useState<ProgramDisclosureMode>(current?.disclosureMode ?? "coordinated");
  const [days, setDays] = useState(String(current?.disclosureDays ?? 90));
  const [firstResponse, setFirstResponse] = useState(current?.firstResponseTargetHours?.toString() ?? "72");
  const [triage, setTriage] = useState(current?.triageTargetHours?.toString() ?? "168");
  const [resolution, setResolution] = useState(current?.resolutionTargetDays?.toString() ?? "90");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await publishProgramPolicyAction({
        organizationId,
        programId,
        rulesOfEngagement: rules,
        safeHarbor,
        disclosureMode: mode,
        disclosureDays: mode === "coordinated" ? toNumber(days) : null,
        firstResponseTargetHours: toNumber(firstResponse),
        triageTargetHours: toNumber(triage),
        resolutionTargetDays: toNumber(resolution),
        changeNote: note || undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {current ? "Publish a new version" : "Publish policy"}
      </Button>
      <Dialog open={open} title={current ? `Publish policy v${current.versionNumber + 1}` : "Publish program policy"} onClose={() => !pending && setOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Researchers must accept this version before submitting. Reports already submitted keep the version they were submitted under.</p>
          <Textarea label="Rules of engagement" required rows={8} value={rules} onChange={(e) => setRules(e.target.value)} maxLength={20000} helperText="Testing rules, prohibited techniques, rate limits, test accounts, what not to touch." />
          <Checkbox label="Commit to the platform safe harbor for good-faith research under this policy" checked={safeHarbor} onChange={(e) => setSafeHarbor(e.target.checked)} />
          <Select label="Disclosure policy" value={mode} onChange={(e) => setMode(e.target.value as ProgramDisclosureMode)}>
            <option value="coordinated">Coordinated -- researcher may publish after resolution and a waiting period</option>
            <option value="full">Full -- researcher may publish once the report is closed</option>
            <option value="none">None -- no public disclosure</option>
          </Select>
          {mode === "coordinated" && <Input label="Days after resolution" type="number" min={0} max={365} value={days} onChange={(e) => setDays(e.target.value)} />}
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="First response (hours)" type="number" min={1} max={720} value={firstResponse} onChange={(e) => setFirstResponse(e.target.value)} helperText="Blank for no target" />
            <Input label="Triage (hours)" type="number" min={1} max={2160} value={triage} onChange={(e) => setTriage(e.target.value)} />
            <Input label="Resolution (days)" type="number" min={1} max={365} value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </div>
          <Input label="What changed (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" pending={pending} onClick={submit}>
              Publish
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
