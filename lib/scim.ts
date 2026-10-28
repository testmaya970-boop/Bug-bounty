// SCIM 2.0 (RFC 7643/7644) shapes for the Users endpoint. Pure, so it is unit tested.

export const SCIM_USER = "urn:ietf:params:scim:schemas:core:2.0:User";
const LIST = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const ERROR = "urn:ietf:params:scim:api:messages:2.0:Error";
const PATCH_OP = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

export type ScimUserView = { id: string; email: string; displayName: string; active: boolean };

export function scimUser(u: ScimUserView, base: string) {
  return {
    schemas: [SCIM_USER],
    id: u.id,
    userName: u.email,
    displayName: u.displayName,
    name: { formatted: u.displayName },
    emails: [{ value: u.email, primary: true, type: "work" }],
    active: u.active,
    meta: { resourceType: "User", location: `${base}/Users/${u.id}` },
  };
}

export function scimList(users: ScimUserView[], total: number, startIndex: number, base: string) {
  return { schemas: [LIST], totalResults: total, startIndex, itemsPerPage: users.length, Resources: users.map((u) => scimUser(u, base)) };
}

export function scimError(status: number, detail: string, scimType?: string) {
  return { schemas: [ERROR], status: String(status), detail, ...(scimType ? { scimType } : {}) };
}

/** Okta and Entra look a user up with `userName eq "a@b.c"`; that is the one filter supported. */
export function parseUserNameFilter(filter: string | null): string | null | "unsupported" {
  if (!filter) return null;
  const m = /^\s*userName\s+eq\s+"([^"]{1,254})"\s*$/i.exec(filter);
  return m ? m[1] : "unsupported";
}

type CreateBody = { userName?: string; displayName?: string; name?: { formatted?: string; givenName?: string; familyName?: string }; emails?: { value?: string; primary?: boolean }[]; active?: boolean };

export function parseCreate(body: CreateBody): { email: string; displayName: string | null; active: boolean } | null {
  const email = (body.emails?.find((e) => e.primary)?.value ?? body.emails?.[0]?.value ?? body.userName ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return null;
  const displayName = body.displayName ?? body.name?.formatted ?? ([body.name?.givenName, body.name?.familyName].filter(Boolean).join(" ") || null);
  return { email, displayName: displayName ? displayName.slice(0, 120) : null, active: body.active !== false };
}

/** PATCH Operations: `active` and the display name, in either path or value form. */
export function parsePatch(body: { schemas?: string[]; Operations?: { op?: string; path?: string; value?: unknown }[] }): { active?: boolean; displayName?: string } | null {
  if (!body.schemas?.includes(PATCH_OP) || !Array.isArray(body.Operations)) return null;
  const out: { active?: boolean; displayName?: string } = {};
  for (const op of body.Operations) {
    if (!["replace", "add"].includes((op.op ?? "").toLowerCase())) continue;
    const apply = (path: string, value: unknown) => {
      if (path.toLowerCase() === "active") out.active = value === true || value === "true" || value === "True";
      if (path.toLowerCase() === "displayname" && typeof value === "string") out.displayName = value.slice(0, 120);
    };
    if (op.path) apply(op.path, op.value);
    else if (op.value && typeof op.value === "object") for (const [k, v] of Object.entries(op.value as Record<string, unknown>)) apply(k, v);
  }
  return out;
}
