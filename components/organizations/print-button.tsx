"use client";

import React from "react";
import { Printer } from "@phosphor-icons/react";
import { Button } from "../ui/button";

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      <Printer aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}
