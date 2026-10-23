"use client";

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Dialog } from "../ui/navigation";
import { Select } from "../ui/form";
import { addScopeEntryAction } from "../../actions/scope";
import { assetTypeLabel, scopeStateLabel } from "../../lib/scope-labels";
import { detectFormatFromFilename, parseScopeFile, type ScopeImportFormat, type ScopeImportRowResult } from "../../lib/scope-import-export";

type ImportOutcome = { line: number; target: string; ok: boolean; message: string };

/** Bulk scope import -- reuses the exact same addScopeEntryAction every manual "Add
 * scope" submission calls, once per parsed row, so an imported entry is validated,
 * canonicalized, deduplicated, and audited identically to one entered by hand. There is
 * no bulk RPC: replaying the single-row RPC N times is deliberate (see this file's own
 * per-row result reporting below) rather than a new all-or-nothing batch call, so one bad
 * row (an invalid target, a duplicate) never blocks every other valid row in the same
 * file from being imported. */
export function ImportScopeDialog({ organizationId, programId }: { organizationId: string; programId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ScopeImportFormat>("csv");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ScopeImportRowResult[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setFileName(null);
    setRows(null);
    setParseError(null);
    setOutcomes(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function close() {
    if (pending) return;
    setOpen(false);
    reset();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setOutcomes(null);
    setParseError(null);
    setFileName(file.name);
    const detected = detectFormatFromFilename(file.name);
    const effectiveFormat = detected ?? format;
    if (detected) setFormat(detected);

    const text = await file.text();
    try {
      const parsed = parseScopeFile(text, effectiveFormat);
      if (parsed.length === 0) {
        setParseError("No rows found in this file.");
        setRows(null);
        return;
      }
      setRows(parsed);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Could not parse this file.");
      setRows(null);
    }
  }

  function handleImport() {
    if (!rows || pending) return;
    const validRows = rows.filter((r): r is Extract<ScopeImportRowResult, { ok: true }> => r.ok);
    startTransition(async () => {
      const results: ImportOutcome[] = [];
      // Sequential, not Promise.all -- each call is its own real transaction/audit row,
      // and running them one at a time keeps a large file from firing dozens of
      // concurrent Server Action requests at once (see the pg client-concurrency bug
      // already fixed elsewhere in this codebase for why concurrent DB work sharing
      // resources needs care, even though these are separate transactions here).
      for (const row of validRows) {
        const result = await addScopeEntryAction({
          organizationId,
          programId,
          assetType: row.row.assetType,
          targetInput: row.row.target,
          scopeState: row.row.scopeState,
          description: row.row.description,
        });
        results.push({ line: row.line, target: row.row.target, ok: result.ok, message: result.ok ? "Added" : result.message });
      }
      setOutcomes(results);
      if (results.some((r) => r.ok)) router.refresh();
    });
  }

  const invalidCount = rows?.filter((r) => !r.ok).length ?? 0;
  const validCount = rows ? rows.length - invalidCount : 0;
  const successCount = outcomes?.filter((o) => o.ok).length ?? 0;
  const failureCount = outcomes ? outcomes.length - successCount : 0;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Import
      </Button>
      <Dialog open={open} title="Import scope entries" onClose={close}>
        <div className="space-y-4">
          {!outcomes && (
            <>
              <p className="text-sm text-ink-muted">
                Upload a CSV, JSON, or YAML file listing targets to add to this engagement&apos;s scope. Each row needs a target and asset type; scope state defaults to in scope if omitted. A HackerOne scope CSV export works as-is.
              </p>

              <Select label="File format" value={format} onChange={(event) => setFormat(event.target.value as ScopeImportFormat)} helperText="Detected automatically from the file extension when possible.">
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
                <option value="yaml">YAML</option>
              </Select>

              <div>
                <label htmlFor="scope-import-file" className="mb-1.5 block text-sm font-medium text-ink">
                  File
                </label>
                <input
                  ref={fileInputRef}
                  id="scope-import-file"
                  type="file"
                  accept=".csv,.json,.yaml,.yml,text/csv,application/json,application/yaml,text/yaml"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-ink file:mr-3 file:min-h-11 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:text-sm file:font-semibold file:text-ink hover:file:bg-surface-muted"
                />
                {fileName && <p className="mt-1 text-xs text-ink-muted">{fileName}</p>}
              </div>

              {parseError && (
                <p role="alert" className="text-sm font-medium text-danger">
                  {parseError}
                </p>
              )}

              {rows && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-ink">
                    {validCount} row{validCount === 1 ? "" : "s"} will be submitted{invalidCount > 0 ? `, ${invalidCount} skipped for a file-level error (shown below)` : ""}. Each target is still validated individually when
                    submitted -- a row shown here can still fail (e.g. an invalid IP/CIDR or a duplicate target); the result after importing shows exactly which ones did.
                  </p>
                  <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border bg-surface-muted text-xs font-semibold text-ink-muted">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Target</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">State</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.map((result) =>
                          result.ok ? (
                            <tr key={result.line}>
                              <td className="px-3 py-2 font-mono text-xs text-ink-muted">{result.line}</td>
                              <td className="px-3 py-2 font-mono">{result.row.target}</td>
                              <td className="px-3 py-2">{assetTypeLabel(result.row.assetType)}</td>
                              <td className="px-3 py-2">{scopeStateLabel(result.row.scopeState)}</td>
                              <td className="px-3 py-2 text-ink-muted">
                                Will submit
                                {result.note && <span className="block text-xs text-warning">{result.note}</span>}
                              </td>
                            </tr>
                          ) : (
                            <tr key={result.line}>
                              <td className="px-3 py-2 font-mono text-xs text-ink-muted">{result.line}</td>
                              <td colSpan={3} className="px-3 py-2 text-danger">
                                {result.error}
                              </td>
                              <td className="px-3 py-2 text-danger">Skipped</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {outcomes && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">
                {successCount} added{failureCount > 0 ? `, ${failureCount} failed` : ""}.
              </p>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface-muted text-xs font-semibold text-ink-muted">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Target</th>
                      <th className="px-3 py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {outcomes.map((outcome) => (
                      <tr key={outcome.line}>
                        <td className="px-3 py-2 font-mono text-xs text-ink-muted">{outcome.line}</td>
                        <td className="px-3 py-2 font-mono">{outcome.target}</td>
                        <td className={`px-3 py-2 ${outcome.ok ? "text-success" : "text-danger"}`}>{outcome.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {outcomes ? (
              <Button type="button" onClick={close}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="secondary" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <Button type="button" pending={pending} disabled={!rows || validCount === 0} onClick={handleImport}>
                  Import {validCount > 0 ? `${validCount} entr${validCount === 1 ? "y" : "ies"}` : ""}
                </Button>
              </>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
