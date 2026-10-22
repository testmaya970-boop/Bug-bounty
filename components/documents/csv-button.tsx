"use client";

import React from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { Button } from "../ui/button";

/** Downloads the rows the page already shows as a CSV (built in the browser, no request). */
export function CsvButton({ filename, header, rows }: { filename: string; header: string[]; rows: (string | number | null)[][] }) {
  function download() {
    const cell = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      // Quote everything; a leading = + - @ would run as a formula in a spreadsheet.
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Button type="button" variant="secondary" onClick={download}>
      <DownloadSimple aria-hidden="true" className="size-4" />
      CSV
    </Button>
  );
}
