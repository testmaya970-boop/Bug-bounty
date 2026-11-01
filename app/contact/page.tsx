import React from "react";
import Link from "next/link";
import type { Route } from "next";
import type { Metadata } from "next";
import { SimplePageShell } from "../../components/simple-page-shell";
import { SectionLabel } from "../../components/ui/security-primitives";
import { ContactForm } from "../../components/contact/contact-form";
import { CONTACT_TOPICS } from "../../services/contact-requests";
import { captchaConfig } from "../../lib/integrations/captcha";
import { getCurrentUser } from "../../lib/auth/current-user";

export const metadata: Metadata = { title: "Contact | Unpatched", description: "Talk to Unpatched before you launch a bug bounty or vulnerability disclosure program." };

const NEXT_STEPS = [
  { title: "A person replies", body: "Within one business day, from the team that runs launches. No sales sequence." },
  { title: "We map your scope", body: "Which domains, apps and APIs researchers may test, and what stays off limits." },
  { title: "You prove ownership", body: "A DNS record per domain. Researchers are only ever sent to assets you have verified you own." },
];

/** Public: organizations reach Unpatched before they have an account. Messages land in
 * /platform/contact-requests. */
export default async function ContactPage() {
  const user = await getCurrentUser();
  return (
    <SimplePageShell title="Talk to us before you launch" user={user}>
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <aside className="min-w-0 space-y-6">
          <p className="text-sm leading-relaxed text-ink-muted">Planning a bug bounty, a disclosure program or a private pilot? Tell us what you run. We will help you decide what to put in scope and how to pay for it.</p>
          <div>
            <SectionLabel>What happens next</SectionLabel>
            <ol className="mt-3 space-y-4">
              {NEXT_STEPS.map((step, i) => (
                <li key={step.title} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
                  <span className="font-mono text-sm text-action">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{step.title}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="border-t border-border pt-4 text-sm text-ink-muted">
            Ready already?{" "}
            <Link prefetch={false} href={"/organizations/sign-up" as Route} className="font-medium text-action underline underline-offset-2">
              Create an organization account
            </Link>
            .
          </p>
        </aside>
        <section aria-label="Contact form" className="min-w-0">
          <ContactForm topics={CONTACT_TOPICS} captcha={captchaConfig()} />
        </section>
      </div>
    </SimplePageShell>
  );
}
