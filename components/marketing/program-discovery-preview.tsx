import React from "react";
import Link from "next/link";

/**
 * `programs.visibility` now exists and a real, anonymous-safe public listing is live at
 * /programs (see docs/decisions/0041-public-program-discovery-vertical-slice.md) --
 * replacing the honest "coming" disclosure this component previously carried. Still a
 * single small note, not a major section: most programs remain private/invite-only, and
 * this page must not overstate how many are public.
 */
export function ProgramDiscoveryPreview() {
  return (
    <p className="border-l-2 border-border-strong pl-4 text-sm text-ink-muted">
      Some organizations open their program to the whole community.{" "}
      <Link href="/programs" className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        See public programs →
      </Link>{" "}
      Most programs remain invitation-only.
    </p>
  );
}
