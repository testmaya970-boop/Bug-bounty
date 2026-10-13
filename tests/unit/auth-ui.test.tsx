import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PasswordInput, passwordStrengthLabel, passwordStrengthLevel } from "../../components/auth/password-input";
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

describe("passwordStrengthLabel: the letter + number + special-character rule first, then length", () => {
  it("is null for an empty field", () => {
    expect(passwordStrengthLabel("")).toBeNull();
  });

  it("names what's missing: length, a letter, a number, a special character", () => {
    expect(passwordStrengthLabel("short1!")).toBe("Use at least 12 characters");
    expect(passwordStrengthLabel("123456789012!")).toBe("Add at least one letter");
    expect(passwordStrengthLabel("twelvecharspw!")).toBe("Add at least one number");
    expect(passwordStrengthLabel("twelvecharspw1")).toBe("Add at least one special character (e.g. ! @ # $)");
  });

  it("scores a password that meets the rule by length -- Fair, Good, Strong", () => {
    expect(passwordStrengthLabel("twelvechar1!")).toBe("Fair");
    expect(passwordStrengthLabel("sixteenchars-12!")).toBe("Good");
    expect(passwordStrengthLabel("twenty-plus-chars-long-1")).toBe("Strong");
  });
});

describe("passwordStrengthLevel: the same rule as passwordStrengthLabel, as a 0-4 level", () => {
  it("agrees with passwordStrengthLabel at every tier", () => {
    expect(passwordStrengthLevel("")).toBe(0);
    expect(passwordStrengthLevel("twelvecharspw1")).toBe(1);
    expect(passwordStrengthLevel("twelvechar1!")).toBe(2);
    expect(passwordStrengthLevel("sixteenchars-12!")).toBe(3);
    expect(passwordStrengthLevel("twenty-plus-chars-long-1")).toBe(4);
  });
});

describe("isBusinessEmail: rejects known free/consumer webmail domains only", () => {
  it("rejects common free-email domains", () => {
    expect(isBusinessEmail("owner@gmail.com")).toBe(false);
    expect(isBusinessEmail("owner@yahoo.com")).toBe(false);
    expect(isBusinessEmail("owner@outlook.com")).toBe(false);
    expect(isBusinessEmail("owner@yahoo.co.in")).toBe(false);
    expect(isBusinessEmail("owner@hotmail.co.uk")).toBe(false);
    expect(isBusinessEmail("owner@rediffmail.com")).toBe(false);
    expect(isBusinessEmail("owner@mailinator.com")).toBe(false);
    expect(isBusinessEmail("owner@abc.10minutemail.com")).toBe(false);
    expect(isBusinessEmail("owner@yopmail.com")).toBe(false);
    expect(isBusinessEmail("owner@mail.acme-corp.com")).toBe(true);
  });

  it("accepts a company's own domain, including one this list has never heard of", () => {
    expect(isBusinessEmail("owner@acme-security.test")).toBe(true);
    expect(isBusinessEmail("owner@a-brand-new-startup.io")).toBe(true);
  });

  it("rejects an email with no domain rather than throwing", () => {
    expect(isBusinessEmail("not-an-email")).toBe(false);
  });
});
