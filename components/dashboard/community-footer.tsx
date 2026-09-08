import React from "react";
import { Card } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";

const SOCIAL_LINKS = [
  { label: "LinkedIn", href: "#" },
  { label: "Instagram", href: "#" },
  { label: "X (Twitter)", href: "#" },
  { label: "Blog", href: "#" },
];

export function CommunityFooter() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="p-5">
        <SectionLabel>Community</SectionLabel>
        <h2 className="mt-1 text-lg font-semibold text-ink">Stay connected</h2>
        <p className="mt-1 text-sm text-ink-muted">Follow along for research write-ups and platform updates.</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {SOCIAL_LINKS.map((link) => (
            <li key={link.label}>
              <a href={link.href} className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm font-medium text-ink-muted hover:border-border-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <SectionLabel>Support</SectionLabel>
        <h2 className="mt-1 text-lg font-semibold text-ink">Still have questions?</h2>
        <p className="mt-1 text-sm text-ink-muted">Our help center covers scope, submissions, and payouts.</p>
        <a href="#" className="mt-4 inline-flex min-h-11 items-center rounded-md border border-border-strong px-5 text-sm font-semibold text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Visit help center
        </a>
      </Card>
    </div>
  );
}
