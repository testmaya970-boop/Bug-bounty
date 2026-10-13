"use client";

import React, { useState } from "react";
import { Question } from "@phosphor-icons/react";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";

/** One payout route (INR, other currencies) and whether a provider sends the money or a person does. */
export type PayoutRoute = { label: string; automated: boolean };

// Frozen per payment at creation (202609250010); this is only the explanation.
const PLATFORM_FEE_PERCENT = 20;

/** The org-facing explanation of how a bounty becomes money in a researcher's account. */
export function HowPayingWorks({ routes }: { routes: PayoutRoute[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Question aria-hidden="true" className="size-4" />
        How paying works
      </Button>
      <Dialog open={open} title="How paying works" onClose={() => setOpen(false)}>
        <ol className="space-y-5 text-sm text-ink-muted">
          <Step n={1} title="You add funds">
            Send money to Unpatched by UPI, IMPS, NEFT or RTGS in rupees, or by wire or ACH in US dollars, with your organization&apos;s code in the remarks. Then report the transfer
            under <span className="font-medium text-ink">Add funds</span>. It becomes available to award once we see it arrive in our account.
          </Step>
          <Step n={2} title="You award a bounty">
            Awarding takes the bounty plus a {PLATFORM_FEE_PERCENT}% platform fee from your balance straight away, so the money is set aside. If the balance can&apos;t cover it, the
            award waits until you add funds. The researcher always gets the full bounty.
          </Step>
          <Step n={3} title="Unpatched checks the researcher can be paid">
            Before any money moves, the researcher needs a verified identity, an approved tax form and a payout method. You see only whether each is ready. Identity documents, tax
            IDs and bank or PayPal details stay with Unpatched and are never shown to your organization.
          </Step>
          <Step n={4} title="You press Pay researcher, Unpatched sends it">
            <ul className="mt-2 space-y-2">
              {routes.map((route) => (
                <li key={route.label} className="rounded-md border border-border bg-surface-muted px-3 py-2">
                  <p className="font-medium text-ink">{route.label}</p>
                  <p className="mt-0.5">
                    {route.automated
                      ? "Sent through our payout partner. The status changes to Paid or Failed on its own."
                      : "Sent by Unpatched's payments team by bank or PayPal transfer. The status changes to Paid once it's done."}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-2">A failed payout can be retried. An award not yet paid can be cancelled, and its money goes back to your available balance.</p>
          </Step>
        </ol>
        <p className="mt-6 border-t border-border pt-4 text-xs text-ink-muted">
          Owners, security admins and billing admins can manage payments. Billing admins see report titles only, never report contents.
        </p>
      </Dialog>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-3">
      <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full border border-border font-mono text-xs font-semibold text-ink">
        {n}
      </span>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  );
}
