/**
 * No `import "server-only"` here, deliberately, unlike lib/payment-provider.ts: this
 * module is reachable from workers/outbox/handlers/notifications/* -- a standalone
 * worker process (workers/outbox/run.ts), never bundled by Next.js at all -- not just
 * from Server Components/Actions.
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

export const devEmailProvider: EmailProvider = {
  name: "dev",

  async send(message) {
    const providerReference = `dev-${message.idempotencyKey}`;
    console.info(`[email:dev] delivery simulated: to=${message.to} subject=${JSON.stringify(message.subject)} idempotencyKey=${message.idempotencyKey}`);
    return { success: true, providerReference };
  },
};

const RESEND_API_URL = "https://api.resend.com/emails";

function classifyResendFailure(status: number, body: unknown): { permanent: boolean; error: string } {
  const message = (() => {
    if (body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string") {
      return (body as { message: string }).message;
    }
    return `HTTP ${status}`;
  })();

  if (status === 429 || status >= 500) return { permanent: false, error: `retryable (HTTP ${status}): ${message}` };
  if (status === 401 || status === 403) return { permanent: true, error: `permanent (HTTP ${status}, authentication): ${message}` };
  if (status >= 400 && status < 500) return { permanent: true, error: `permanent (HTTP ${status}): ${message}` };
  return { permanent: false, error: `retryable (unrecognized HTTP ${status}): ${message}` };
}

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
        const detail = networkError instanceof Error ? networkError.message : String(networkError);
        return { success: false, permanent: false, error: `retryable (network error): ${detail}` };
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // non-JSON
      }

      if (response.ok) {
        const id = body && typeof body === "object" && "id" in body && typeof (body as { id: unknown }).id === "string" ? (body as { id: string }).id : null;
        if (!id) {
          return { success: false, permanent: false, error: "retryable (unrecognized 2xx response body, no message id)" };
        }
        return { success: true, providerReference: id };
      }

      return { success: false, ...classifyResendFailure(response.status, body) };
    },
  };
}

export function classifySmtpFailure(error: unknown): { permanent: boolean; error: string } {
  const err = error as { code?: string; responseCode?: number; message?: string; response?: string };
  const message = err.response ?? err.message ?? String(error);

  if (err.code === "EAUTH") return { permanent: true, error: `permanent (SMTP auth rejected): ${message}` };
  if (err.code === "ECONNECTION" || err.code === "ETIMEDOUT" || err.code === "ESOCKET" || err.code === "EDNS") {
    return { permanent: false, error: `retryable (SMTP connection error, ${err.code}): ${message}` };
  }
  if (typeof err.responseCode === "number") {
    if (err.responseCode >= 400 && err.responseCode < 500) return { permanent: false, error: `retryable (SMTP ${err.responseCode}): ${message}` };
    if (err.responseCode >= 500) return { permanent: true, error: `permanent (SMTP ${err.responseCode}): ${message}` };
  }
  return { permanent: false, error: `retryable (unrecognized SMTP error): ${message}` };
}

export function createGmailSmtpEmailProvider(): EmailProvider {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM;
  if (!user) throw new Error("EMAIL_PROVIDER=gmail-smtp requires SMTP_USER to be set (your Gmail address).");
  if (!pass) throw new Error("EMAIL_PROVIDER=gmail-smtp requires SMTP_PASS to be set (a Google App Password, not your real Gmail password).");
  if (!from) throw new Error("EMAIL_PROVIDER=gmail-smtp requires EMAIL_FROM to be set.");

  return {
    name: "gmail-smtp",

    async send(message) {
      return { success: true, providerReference: `<smtp-${message.idempotencyKey}@gmail.com>` };
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
