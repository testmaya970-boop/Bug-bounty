import nodemailer, { type Transporter } from "nodemailer";

/**
 * No `import "server-only"` here, deliberately, unlike lib/payment-provider.ts: this
 * module is reachable from workers/outbox/handlers/notifications/* -- a standalone
 * worker process (workers/outbox/run.ts), never bundled by Next.js at all -- not just
 * from Server Components/Actions. The `server-only` guard relies on webpack/Turbopack's
 * special module resolution to enforce itself; outside that bundler (a plain Node/tsx
 * process, exactly how the worker and its verification scripts run) it throws
 * unconditionally instead of no-op'ing, which would break every real invocation of this
 * file. No client component imports this module directly, so the guard's actual purpose
 * (never let this reach a browser bundle) is already satisfied without it.
 *
 * The notification domain (services/notifications.ts, workers/outbox/handlers/
 * notifications/*) knows only "email provider" -- never a concrete SDK. This is the
 * entire surface a real provider needs to implement to replace devEmailProvider below;
 * nothing else in the codebase may import a provider SDK or call `fetch` against an
 * email API directly.
 *
 * See docs/decisions/0022-real-email-provider-integration.md for: why Resend, why a raw
 * `fetch` call rather than the `resend` npm package (no new dependency for a single POST
 * endpoint -- the same minimalism this codebase already applies to `lib/money.ts`'s
 * string-based arithmetic), the error-classification table, and exactly what was and was
 * not live-tested.
 *
 * Idempotency: every send is given a Unpatched-generated idempotencyKey (the delivery
 * row's own id, minted durably before any provider call), passed through as Resend's own
 * `Idempotency-Key` header -- identical reasoning to lib/payment-provider.ts's
 * `idempotencyKey` parameter. This is also why an ambiguous provider response below is
 * safe to treat as retryable rather than assumed to be a duplicate risk: a retried send
 * carries the identical key, so Resend's own deduplication -- not this file -- is what
 * prevents a second real message if the first attempt actually succeeded.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};

export type EmailSendResult =
  | { success: true; providerReference: string }
  | { success: false; permanent: boolean; error: string };

export type EmailProvider = {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
};

/**
 * Exists only to prove the notification/delivery abstraction end to end without real
 * provider credentials. Explicitly logs "delivery simulated" -- never claims a real send
 * succeeded, and never silently no-ops (a caller can always see, via the log line and the
 * returned providerReference, that nothing left the process). This remains the default
 * provider for local development and the test suite -- selecting a real provider is
 * always an explicit, separate opt-in (see resolveEmailProvider below).
 */
export const devEmailProvider: EmailProvider = {
  name: "dev",

  async send(message) {
    const providerReference = `dev-${message.idempotencyKey}`;
    console.info(`[email:dev] delivery simulated: to=${message.to} subject=${JSON.stringify(message.subject)} idempotencyKey=${message.idempotencyKey}`);
    return { success: true, providerReference };
  },
};

const RESEND_API_URL = "https://api.resend.com/emails";

/** A deterministic, conservative retryable/permanent split. When Resend's response
 * genuinely does not distinguish (an unrecognized status code, or a 2xx whose body
 * cannot be parsed for a message id), this classifies as retryable rather than
 * permanent -- record_email_delivery_result's own max_attempts bound already caps how
 * long an actually-permanent failure gets retried, so the safe default is "give the
 * outbox's existing bounded retry a chance," never "give up on the caller's behalf after
 * a single ambiguous response." See docs/decisions/0022 for the full table. */
function classifyResendFailure(status: number, body: unknown): { permanent: boolean; error: string } {
  const message = (() => {
    if (body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string") {
      return (body as { message: string }).message;
    }
    return `HTTP ${status}`;
  })();

  // 429 (rate limited) and every 5xx (provider-side outage) are the provider telling us
  // to try again later, by definition retryable.
  if (status === 429 || status >= 500) return { permanent: false, error: `retryable (HTTP ${status}): ${message}` };
  // 401/403: the configured API key is rejected -- every subsequent attempt with the
  // identical, unchanged configuration will fail identically. A configuration problem,
  // not a transient one.
  if (status === 401 || status === 403) return { permanent: true, error: `permanent (HTTP ${status}, authentication): ${message}` };
  // Every other 4xx (400 malformed request, 422 invalid recipient/sender/unsupported
  // field) is a request Resend will never accept as-is, regardless of how many times it
  // is retried unchanged.
  if (status >= 400 && status < 500) return { permanent: true, error: `permanent (HTTP ${status}): ${message}` };
  // An unrecognized status this classifier was not written to expect -- retryable by the
  // conservative-default reasoning above, not silently assumed safe to abandon.
  return { permanent: false, error: `retryable (unrecognized HTTP ${status}): ${message}` };
}

/** Reads RESEND_API_KEY/EMAIL_FROM at the moment the resend provider is selected (module
 * load, via resolveEmailProvider), not lazily on first send -- so a misconfigured
 * production deployment fails immediately at startup with a clear error, never on the
 * first real notification some time later. Never logs the API key itself, an email
 * body, or notification content -- only a delivery id, the classification, and a
 * provider-supplied message, matching this codebase's existing structured-logging
 * conventions (lib/request-context.ts). */
export function createResendEmailProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey) throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY to be set.");
  if (!from) throw new Error("EMAIL_PROVIDER=resend requires EMAIL_FROM to be set.");

  return {
    name: "resend",

    async send(message) {
      let response: Response;
      try {
        response = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
        });
      } catch (networkError) {
        // The request never reached (or never returned from) the provider at all -- DNS,
        // connection refused, timeout. Always retryable: nothing about the request itself
        // was rejected.
        const detail = networkError instanceof Error ? networkError.message : String(networkError);
        return { success: false, permanent: false, error: `retryable (network error): ${detail}` };
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // A non-JSON or empty body -- handled below by the id-presence check for a 2xx,
        // and classifyResendFailure's own message fallback for a non-2xx.
      }

      if (response.ok) {
        const id = body && typeof body === "object" && "id" in body && typeof (body as { id: unknown }).id === "string" ? (body as { id: string }).id : null;
        if (!id) {
          // A 2xx response Resend's own documented shape does not match -- this must
          // never be treated as a confirmed success (section 4's own explicit rule).
          return { success: false, permanent: false, error: "retryable (unrecognized 2xx response body, no message id)" };
        }
        return { success: true, providerReference: id };
      }

      return { success: false, ...classifyResendFailure(response.status, body) };
    },
  };
}

/** A deterministic retryable/permanent split for nodemailer's own thrown errors, mirroring
 * classifyResendFailure's reasoning above (network/rate/outage = retryable, a rejected
 * credential or a rejected recipient/message = permanent, unrecognized = retryable by the
 * same conservative default). nodemailer surfaces SMTP failures as a thrown error with a
 * `code` (e.g. "EAUTH", "ECONNECTION") and, for a real SMTP-protocol rejection, a
 * `responseCode` (the numeric SMTP reply code) -- both are used here, `code` first since
 * a connection-level failure has no responseCode at all. */
export function classifySmtpFailure(error: unknown): { permanent: boolean; error: string } {
  const err = error as { code?: string; responseCode?: number; message?: string; response?: string };
  const message = err.response ?? err.message ?? String(error);

  if (err.code === "EAUTH") return { permanent: true, error: `permanent (SMTP auth rejected): ${message}` };
  if (err.code === "ECONNECTION" || err.code === "ETIMEDOUT" || err.code === "ESOCKET" || err.code === "EDNS") {
    return { permanent: false, error: `retryable (SMTP connection error, ${err.code}): ${message}` };
  }
  if (typeof err.responseCode === "number") {
    // SMTP reply codes: 4xx is a transient failure (try again later), 5xx is permanent
    // (the server will never accept this exact message/recipient) -- the same 4xx/5xx
    // split HTTP status codes get above, just SMTP's own numbering.
    if (err.responseCode >= 400 && err.responseCode < 500) return { permanent: false, error: `retryable (SMTP ${err.responseCode}): ${message}` };
    if (err.responseCode >= 500) return { permanent: true, error: `permanent (SMTP ${err.responseCode}): ${message}` };
  }
  return { permanent: false, error: `retryable (unrecognized SMTP error): ${message}` };
}

/** Gmail SMTP for local development -- an explicit, disclosed alternative to Resend for a
 * developer who wants to see real OTP/notification emails land in a real inbox without
 * signing up for a separate provider. NEVER the recommended choice for anything other
 * than local dev: Gmail's SMTP relay is rate-limited (roughly 500 messages/day per
 * account) and explicitly not intended for application/transactional traffic -- see
 * docs/decisions/0022-real-email-provider-integration.md for why Resend is the real
 * production path. `SMTP_PASS` must be a Google App Password (a 2-Step-Verification-gated,
 * per-app credential), never the account's real login password -- Google's SMTP servers
 * reject a plain account password outright as of 2025. Transporter creation itself can
 * throw on a malformed config; that's allowed to propagate here (same "fail at module
 * load, not on first send" posture createResendEmailProvider already establishes). */
export function createGmailSmtpEmailProvider(): EmailProvider {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM;
  if (!user) throw new Error("EMAIL_PROVIDER=gmail-smtp requires SMTP_USER to be set (your Gmail address).");
  if (!pass) throw new Error("EMAIL_PROVIDER=gmail-smtp requires SMTP_PASS to be set (a Google App Password, not your real Gmail password).");
  if (!from) throw new Error("EMAIL_PROVIDER=gmail-smtp requires EMAIL_FROM to be set.");

  const transporter: Transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  return {
    name: "gmail-smtp",

    async send(message) {
      try {
        // nodemailer has no built-in idempotency-key concept (unlike Resend's own header)
        // -- passed through as a custom header instead, purely for cross-referencing a
        // delivery row against Gmail's own "Sent" copy by hand if ever needed; it has no
        // effect on Gmail's own delivery behavior (Gmail does not deduplicate on it the
        // way Resend does), so a retried send after an AMBIGUOUS failure genuinely can
        // result in a duplicate message -- an accepted, disclosed gap for a local-dev-only
        // provider, not a claim of the same real dedup guarantee Resend provides.
        const info = await transporter.sendMail({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          headers: { "X-Idempotency-Key": message.idempotencyKey },
        });
        return { success: true, providerReference: info.messageId };
      } catch (error) {
        return { success: false, ...classifySmtpFailure(error) };
      }
    },
  };
}

/** The one, explicit provider-selection mechanism -- EMAIL_PROVIDER defaults to "dev"
 * whenever unset, so no existing local/test environment can start sending real email
 * merely by this feature shipping. Evaluated once at module load: a resend/gmail-smtp
 * selection with missing credentials throws immediately here, not on the first real send. */
function resolveEmailProvider(): EmailProvider {
  const selection = process.env.EMAIL_PROVIDER ?? "dev";
  if (selection === "dev") return devEmailProvider;
  if (selection === "resend") return createResendEmailProvider();
  if (selection === "gmail-smtp") return createGmailSmtpEmailProvider();
  throw new Error(`Unknown EMAIL_PROVIDER "${selection}": expected "dev", "resend", or "gmail-smtp".`);
}

/** The active provider for this deployment. See lib/payment-provider.ts for the
 * identical seam-and-swap pattern this mirrors -- adding a second real provider later
 * means writing a new EmailProvider implementation and adding one more branch to
 * resolveEmailProvider; nothing else in the codebase changes. */
export const activeEmailProvider: EmailProvider = resolveEmailProvider();
