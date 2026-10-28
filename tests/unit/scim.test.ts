import { describe, expect, it } from "vitest";
import { parseCreate, parsePatch, parseUserNameFilter, scimError, scimList, SCIM_USER } from "../../lib/scim";

const PATCH = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

describe("SCIM 2.0 shapes", () => {
  it("supports the userName eq filter identity providers use, and nothing else", () => {
    expect(parseUserNameFilter('userName eq "a@acme.com"')).toBe("a@acme.com");
    expect(parseUserNameFilter(null)).toBeNull();
    expect(parseUserNameFilter('emails co "acme"')).toBe("unsupported");
  });

  it("reads Okta and Entra create bodies", () => {
    expect(parseCreate({ userName: "A@Acme.com", name: { givenName: "Ada", familyName: "L" } })).toEqual({ email: "a@acme.com", displayName: "Ada L", active: true });
    expect(parseCreate({ userName: "x", emails: [{ value: "b@acme.com", primary: true }], active: false })).toEqual({ email: "b@acme.com", displayName: null, active: false });
    expect(parseCreate({ userName: "not-an-email" })).toBeNull();
  });

  it("PATCH works in both path and value forms (Entra sends \"False\" as a string)", () => {
    expect(parsePatch({ schemas: [PATCH], Operations: [{ op: "replace", path: "active", value: false }] })).toEqual({ active: false });
    expect(parsePatch({ schemas: [PATCH], Operations: [{ op: "Replace", value: { active: "False", displayName: "New" } }] })).toEqual({ active: false, displayName: "New" });
    expect(parsePatch({ Operations: [] })).toBeNull();
  });

  it("list and error responses carry the SCIM schemas", () => {
    const l = scimList([{ id: "u", email: "a@acme.com", displayName: "A", active: true }], 1, 1, "https://app/api/scim/v2/c");
    expect(l.Resources[0]).toMatchObject({ schemas: [SCIM_USER], userName: "a@acme.com", active: true, meta: { location: "https://app/api/scim/v2/c/Users/u" } });
    expect(scimError(409, "dup", "uniqueness")).toMatchObject({ status: "409", scimType: "uniqueness" });
  });
});
