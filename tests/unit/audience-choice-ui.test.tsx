import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AudienceChoice } from "../../components/auth/audience-choice";

describe("AudienceChoice: the one first-authentication decision, encoded as two real links", () => {
  it("links Researcher to /researchers/sign-up and Organization to /organizations/sign-up -- never a generic /sign-up", () => {
    const html = renderToStaticMarkup(<AudienceChoice />);
    expect(html).toContain('href="/researchers/sign-up"');
    expect(html).toContain('href="/organizations/sign-up"');
    expect(html).not.toContain('href="/sign-up"');
  });

  it("labels each choice by what the account can do, never a bare role name with no context", () => {
    const html = renderToStaticMarkup(<AudienceChoice />);
    expect(html).toContain("Continue as researcher");
    expect(html).toContain("Continue as organization");
  });
});
