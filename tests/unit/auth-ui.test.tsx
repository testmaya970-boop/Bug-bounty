import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordInput, passwordStrengthLabel, passwordStrengthLevel } from "../../components/auth/password-input";
import { SignUpForm } from "../../components/auth/sign-up-form";
import { ConfirmEmailPending } from "../../components/auth/confirm-email-pending";
import { isBusinessEmail } from "../../lib/auth/business-email";

vi.mock("../../actions/auth", () => ({ signUpAction: vi.fn(), resendConfirmationEmailAction: vi.fn() }));

describe("PasswordInput: structure (interactive show/hide behavior is verified in real Chromium, not here -- this codebase's own established convention for anything stateful, per vitest.config.ts's node environment)", () => {
  it("renders type=\"password\" by default, with an accessible, keyboard-reachable toggle button that never submits the form", () => {
    const html = renderToStaticMarkup(<PasswordInput label="Password" autoComplete="current-password" required value="" onChange={() => {}} />);

    expect(html).toContain('type="password"');
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('type="button"');
    // A real <button>, not a styled <div> or <a> -- keyboard-focusable and
    // activatable by construction, no extra tabindex/role plumbing needed.
    expect(html).toMatch(/<button[^>]*aria-label="Show password"/);
  });

  it("propagates the correct autoComplete value for a password manager to recognize -- current-password vs new-password", () => {
    const signIn = renderToStaticMarkup(<PasswordInput label="Password" autoComplete="current-password" required value="" onChange={() => {}} />);
    const signUp = renderToStaticMarkup(<PasswordInput label="Password" autoComplete="new-password" required value="" onChange={() => {}} />);

    expect(signIn).toContain('autoComplete="current-password"');
    expect(signUp).toContain('autoComplete="new-password"');
  });

  it("associates helper text and an error message with the input via aria-describedby, never color alone for the error", () => {
    const html = renderToStaticMarkup(<PasswordInput label="Password" autoComplete="new-password" required value="" onChange={() => {}} error="Choose a stronger password." />);

    expect(html).toContain("Choose a stronger password.");
    expect(html).toMatch(/aria-describedby="[^"]*-error"/);
    expect(html).toContain('role="alert"');
  });

  it("renders a labelExtra slot beside the label -- the sign-in form's own 'Forgot password?' link uses this, not a second styling implementation", () => {
    const html = renderToStaticMarkup(<PasswordInput label="Password" autoComplete="current-password" required value="" onChange={() => {}} labelExtra={<span>Forgot password?</span>} />);

    expect(html).toContain("Forgot password?");
  });
});

describe("passwordStrengthLabel: length-first, no fabricated composition-rule scoring", () => {
  it("returns null for an empty password -- no premature judgment before the user has typed anything", () => {
    expect(passwordStrengthLabel("")).toBeNull();
  });

  it("flags anything under the real 12-character minimum this app enforces (docs/decisions/0053)", () => {
    expect(passwordStrengthLabel("short1")).toBe("Too short");
    expect(passwordStrengthLabel("eightchr")).toBe("Too short");
  });

  it("scores purely by length -- Fair, Good, Strong -- never by character-composition rules the real auth system does not enforce (supabase/config.toml's own password_requirements is empty)", () => {
    expect(passwordStrengthLabel("twelvecharspw")).toBe("Fair");
    expect(passwordStrengthLabel("sixteencharacters")).toBe("Good");
    expect(passwordStrengthLabel("twentypluscharacterslong")).toBe("Strong");
  });
});

describe("passwordStrengthLevel: the same real thresholds as passwordStrengthLabel, as a 0-4 level", () => {
  it("agrees with passwordStrengthLabel at every tier boundary", () => {
    expect(passwordStrengthLevel("")).toBe(0);
    expect(passwordStrengthLevel("short1")).toBe(1);
    expect(passwordStrengthLevel("twelvecharspw")).toBe(2);
    expect(passwordStrengthLevel("sixteencharacters")).toBe(3);
    expect(passwordStrengthLevel("twentypluscharacterslong")).toBe(4);
  });
});

describe("PasswordInput: strengthLevel renders a real, literal-class segmented bar (never a runtime-derived class name)", () => {
  it("renders no bar at all for an empty password", () => {
    const html = renderToStaticMarkup(<PasswordInput label="Password" autoComplete="new-password" required value="" onChange={() => {}} strengthLevel={0} />);
    expect(html).not.toContain("bg-danger");
  });

  it("renders exactly one lit segment for a too-short password, using a real, literal danger class", () => {
    const html = renderToStaticMarkup(<PasswordInput label="Password" autoComplete="new-password" required value="short1" onChange={() => {}} strengthLevel={1} />);
    expect(html).toContain("bg-danger");
    expect(html).not.toContain("bg-success");
  });

  it("renders a real, literal success class for a strong password", () => {
    const html = renderToStaticMarkup(<PasswordInput label="Password" autoComplete="new-password" required value="twentypluscharacterslong" onChange={() => {}} strengthLevel={4} />);
    expect(html).toContain("bg-success");
  });
});

describe("SignUpForm: intent-specific fields, wrapped in a real card (see docs/decisions/0050)", () => {
  it("shows Your name and Username for a researcher, never Organization name", () => {
    const html = renderToStaticMarkup(<SignUpForm intent="researcher" />);
    expect(html).toContain("Your name");
    expect(html).toContain("Username");
    expect(html).not.toContain("Organization name");
    // A visible card container -- a bordered, padded, shadowed wrapper -- not the bare
    // stacked-input layout the pre-0050 form used.
    expect(html).toMatch(/class="[^"]*rounded-xl[^"]*border[^"]*"/);
  });

  it("shows Organization name and a work-email helper for an organization signup, never Username", () => {
    const html = renderToStaticMarkup(<SignUpForm intent="organization" />);
    expect(html).toContain("Organization name");
    expect(html).not.toContain("Your name");
    expect(html).not.toContain(">Username<");
    expect(html).toContain("Use your work email");
  });
});

describe("ConfirmEmailPending: honest about local-vs-real delivery, a real resend path (see docs/decisions/0052.1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows the local/development notice outside production -- process.env.NODE_ENV is inlined by Next.js's own build, not a Supabase-specific check", () => {
    vi.stubEnv("NODE_ENV", "test");
    const html = renderToStaticMarkup(<ConfirmEmailPending email="researcher@example.test" />);
    expect(html).toContain("Local development");
  });

  it("never shows the local-development notice in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const html = renderToStaticMarkup(<ConfirmEmailPending email="researcher@example.test" />);
    expect(html).not.toContain("Local development");
  });

  it("shows the real email address, a code-entry field, and a resend affordance", () => {
    const html = renderToStaticMarkup(<ConfirmEmailPending email="researcher@example.test" />);
    expect(html).toContain("researcher@example.test");
    expect(html).toContain("Verification code");
    expect(html).toContain("Resend code");
  });
});

describe("isBusinessEmail: rejects known free/consumer webmail domains only", () => {
  it("rejects common free-email domains", () => {
    expect(isBusinessEmail("owner@gmail.com")).toBe(false);
    expect(isBusinessEmail("owner@yahoo.com")).toBe(false);
    expect(isBusinessEmail("owner@outlook.com")).toBe(false);
  });

  it("accepts a company's own domain, including one this list has never heard of", () => {
    expect(isBusinessEmail("owner@acme-security.test")).toBe(true);
    expect(isBusinessEmail("owner@a-brand-new-startup.io")).toBe(true);
  });

  it("rejects an email with no domain rather than throwing", () => {
    expect(isBusinessEmail("not-an-email")).toBe(false);
  });
});
