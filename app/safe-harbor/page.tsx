import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { SimplePageShell } from "../../components/simple-page-shell";
import { SectionLabel } from "../../components/ui/security-primitives";
import { getCurrentUser } from "../../lib/auth/current-user";

/**
 * Safe harbor + code of conduct -- real, static legal content, reachable signed-in or
 * signed-out (a researcher must be able to read this BEFORE deciding to test anything, not
 * only after signing in). Both HackerOne and Bugcrowd treat this as foundational trust
 * infrastructure, not a nice-to-have (see docs/decisions/0075's Part 2 -- this was a
 * confirmed, zero-schema-cost gap: no "safe harbor"/"code of conduct" text existed
 * anywhere in this app prior to this page). Content describes Sentinel's actual current
 * mechanics only -- it does not claim protections the platform doesn't structurally back
 * (e.g. no claim of legal indemnification Sentinel itself can't provide; scope enforcement
 * described here is the real, server-verified scope-matching this app already performs at
 * report submission, per docs/decisions/0008).
 */
export default async function SafeHarborPage() {
  const user = await getCurrentUser();

  return (
    <SimplePageShell title="Safe Harbor & Code of Conduct" user={user}>
      <div className="space-y-8">
        <div>
          <SectionLabel>Trust & safety</SectionLabel>
          <p className="mt-2 text-sm text-ink-muted">What good-faith security research looks like on Unpatched, and what protection it carries.</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-ink">Safe harbor</h2>
          <p className="text-sm leading-relaxed text-ink-muted">
            If you discover a vulnerability while testing strictly within a program's published scope, in good faith, and in compliance with that program's stated rules, Unpatched considers your research authorized. Every report is checked at submission time against
            the program's real, current scope — testing a target that was in scope when you tested it is what matters, not what the scope looks like later.
          </p>
          <p className="text-sm leading-relaxed text-ink-muted">
            Good-faith research means: you make a genuine effort to avoid privacy violations, service disruption, and destruction of data; you do not access, modify, or exfiltrate data beyond what is strictly necessary to demonstrate the vulnerability; you report what
            you find promptly through Unpatched rather than disclosing it elsewhere first; and you stop testing and report immediately if you gain access to data that is clearly not yours to see.
          </p>
          <p className="text-sm leading-relaxed text-ink-muted">
            Safe harbor does not extend to: testing outside a program's published scope; social engineering, physical intrusion, or denial-of-service attacks; exploiting a vulnerability beyond what is needed to prove it exists; or violating any law that authorization
            within a program's scope does not itself excuse (for example, laws unrelated to computer access).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-ink">Code of conduct</h2>
          <p className="text-sm leading-relaxed text-ink-muted">Every researcher and every organization on Unpatched is expected to:</p>
          <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-ink-muted">
            <li>Communicate honestly. A report's severity, impact, and reproduction steps should describe what you actually found — never exaggerated to influence a bounty decision.</li>
            <li>Submit your own, original findings. Reports copied from another researcher's work, from a public disclosure, or generated without a real understanding of the vulnerability are not acceptable.</li>
            <li>Respect the researcher–organization communication channel. Every message on a report is real and reviewed by real people; use it in good faith, not to pressure or threaten.</li>
            <li>Never demand payment as a condition of disclosure, and never threaten to disclose a vulnerability publicly to force a specific bounty amount.</li>
            <li>Respect scope and access boundaries even after finding a way past them.</li>
          </ul>
          <p className="text-sm leading-relaxed text-ink-muted">
            A violation can result in removal from a program, or from Unpatched, depending on severity. If you believe a researcher or an organization has violated this code, contact us through{" "}
            <Link prefetch={false} href={"/settings/feedback" as Route} className="font-medium text-action underline underline-offset-2">
              Help & feedback
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-ink">What this page is not</h2>
          <p className="text-sm leading-relaxed text-ink-muted">
            This is not a substitute for legal advice, and it is not a guarantee that no legal action can ever be taken against you — it describes how Unpatched itself treats good-faith research conducted within these terms. Some jurisdictions and some organizations
            may still impose obligations beyond what is described here; when in doubt about a specific program, read that program's own scope and rules page first.
          </p>
        </section>
      </div>
    </SimplePageShell>
  );
}
