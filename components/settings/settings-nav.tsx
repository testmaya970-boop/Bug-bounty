"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

const ACCOUNT_ITEMS: { href: Route; label: string }[] = [
  { href: "/settings/profile" as Route, label: "Public Profile" },
  { href: "/settings/password" as Route, label: "Email & Password" },
  { href: "/settings/security" as Route, label: "Account Security" },
  { href: "/settings/recovery" as Route, label: "Account Recovery" },
  { href: "/settings/api-tokens" as Route, label: "API Token" },
  { href: "/settings/notifications" as Route, label: "Notifications" },
  { href: "/settings/skills" as Route, label: "Skills & Interests" },
  { href: "/settings/external-services" as Route, label: "External Services" },
  { href: "/settings/deactivate" as Route, label: "Deactivate & Delete" },
];

const RESEARCHER_ITEMS: { href: Route; label: string }[] = [
  { href: "/settings/payments" as Route, label: "Rewards & Payments" },
  { href: "/settings/swag" as Route, label: "Swag" },
  { href: "/settings/reputation" as Route, label: "Reputation" },
  { href: "/settings/calendar" as Route, label: "Calendar" },
  { href: "/settings/subscriptions" as Route, label: "Subscriptions" },
  { href: "/settings/collaboration" as Route, label: "Collaboration" },
  { href: "/settings/invitations" as Route, label: "Invitations" },
  { href: "/settings/digital-agreements" as Route, label: "Digital Agreements" },
  { href: "/settings/feedback" as Route, label: "Feedback & Surveys" },
  { href: "/settings/report-templates" as Route, label: "Report Templates" },
];

function NavGroup({ label, items, path }: { label: string; items: { href: Route; label: string }[]; path: string }) {
  return (
    <div>
      <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <ul className="mt-2 space-y-0.5">
        {items.map((item) => {
          const active = path === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${
                  active ? "bg-surface-muted font-medium text-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The full HackerOne-style settings navigation, on explicit user instruction -- see
 * docs/decisions/0055. "Hacker" renamed to "Researcher" to match Sentinel's own
 * established vocabulary everywhere else in the product; the section order and contents
 * otherwise match what was requested. */
export function SettingsNav() {
  const path = usePathname();
  return (
    <nav aria-label="Settings" className="w-full shrink-0 space-y-6 sm:w-56">
      <NavGroup label="Account" items={ACCOUNT_ITEMS} path={path} />
      <NavGroup label="Researcher" items={RESEARCHER_ITEMS} path={path} />
    </nav>
  );
}
