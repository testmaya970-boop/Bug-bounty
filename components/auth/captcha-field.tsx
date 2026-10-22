"use client";

import React, { useEffect, useId, useRef, useState } from "react";

// The human check's widget (lib/integrations/captcha.ts decides which one, on the server).
// none: renders nothing. sandbox: a plain checkbox (never in production). turnstile:
// Cloudflare's widget, loaded on demand -- allowed by the CSP's strict-dynamic, framed from
// challenges.cloudflare.com only.

export type CaptchaClientConfig = { provider: "none" } | { provider: "sandbox" } | { provider: "turnstile"; siteKey: string };

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

const SANDBOX_TOKEN = "sandbox-human";

export function CaptchaField({ config, onToken }: { config: CaptchaClientConfig; onToken: (token: string | null) => void }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [checked, setChecked] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (config.provider !== "turnstile" || !box.current) return;
    let widget: string | undefined;
    const render = () => {
      if (!window.turnstile || !box.current) return;
      widget = window.turnstile.render(box.current, {
        sitekey: config.siteKey,
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => setFailed(true),
      });
    };
    if (window.turnstile) render();
    else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = render;
      script.onerror = () => setFailed(true);
      document.head.append(script);
    }
    return () => {
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
    // onToken is a stable setter from the parent form.
  }, [config]);

  if (config.provider === "none") return null;
  if (config.provider === "sandbox") {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-md border border-dashed border-border-strong px-3">
        <input
          id={id}
          type="checkbox"
          className="size-4 accent-action"
          checked={checked}
          onChange={(event) => {
            setChecked(event.target.checked);
            onToken(event.target.checked ? SANDBOX_TOKEN : null);
          }}
        />
        <label htmlFor={id} className="text-sm text-ink">
          I&apos;m a person <span className="text-ink-muted">(sandbox human check)</span>
        </label>
      </div>
    );
  }
  return (
    <div>
      <div ref={box} aria-label="Human check" />
      {failed && <p role="alert" className="mt-1 text-xs font-medium text-danger">The human check didn&apos;t load. Reload the page and try again.</p>}
    </div>
  );
}
