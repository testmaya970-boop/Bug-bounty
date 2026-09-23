"use client";

import React, { useState } from "react";
import { Button } from "../ui/button";
import { Select } from "../ui/form";
import { Dialog } from "../ui/navigation";
import { serializeScopeEntries, scopeFileMimeType, type ScopeImportFormat } from "../../lib/scope-import-export";
import type { ScopeEntry } from "../../types/scope";

/** Client-side only -- entries are already fetched and on the page (the same
 * scopeEntries the Scope section itself renders), so export needs no server round trip:
 * serialize what's already here into a Blob and let the browser download it. */
export function ExportScopeButton({ entries, programName }: { entries: ScopeEntry[]; programName: string }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ScopeImportFormat>("csv");

  function handleExport() {
    const content = serializeScopeEntries(entries, format);
    const blob = new Blob([content], { type: scopeFileMimeType(format) });
    const url = URL.createObjectURL(blob);
    const extension = format === "yaml" ? "yaml" : format;
    const safeName = programName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "scope";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}-scope.${extension}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={entries.length === 0}>
        Export
      </Button>
      <Dialog open={open} title="Export scope entries" onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Downloads every active scope entry in this engagement as a file researchers (or your own tooling) can read.</p>
          <Select label="File format" value={format} onChange={(event) => setFormat(event.target.value as ScopeImportFormat)}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleExport}>
              Download
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
