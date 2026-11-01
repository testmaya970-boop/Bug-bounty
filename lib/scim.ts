export interface ScimUserRecord {
  id: string;
  email: string;
  displayName: string | null;
  active: boolean;
}

export function scimError(
  status: number,
  detail: string,
  scimType?: string,
): Record<string, unknown> {
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    status: String(status),
    detail,
    ...(scimType ? { scimType } : {}),
  };
}

export function scimUser(
  user: ScimUserRecord,
  baseUrl: string,
): Record<string, unknown> {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: user.id,
    userName: user.email,
    displayName: user.displayName ?? user.email,
    active: user.active,
    emails: [{ value: user.email, primary: true, type: "work" }],
    meta: {
      resourceType: "User",
      location: `${baseUrl}/Users/${user.id}`,
    },
  };
}

export function scimList(
  users: ScimUserRecord[],
  totalResults: number,
  startIndex: number,
  baseUrl: string,
): Record<string, unknown> {
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults,
    startIndex,
    itemsPerPage: users.length,
    Resources: users.map((u) => scimUser(u, baseUrl)),
  };
}

export function parseUserNameFilter(
  filter: string | null,
): string | null | "unsupported" {
  if (!filter || !filter.trim()) return null;
  const match = filter
    .trim()
    .match(/^userName\s+eq\s+"([^"]+)"$/i);
  if (!match) return "unsupported";
  return match[1]?.trim().toLowerCase() ?? null;
}

export function parseCreate(body: Record<string, unknown>): {
  email: string;
  displayName: string | null;
  active: boolean;
} | null {
  let email =
    typeof body.userName === "string" ? body.userName.trim().toLowerCase() : "";
  if (!email && Array.isArray(body.emails) && body.emails.length > 0) {
    const first = body.emails[0] as { value?: unknown };
    if (typeof first?.value === "string") {
      email = first.value.trim().toLowerCase();
    }
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  const displayName =
    typeof body.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim()
      : null;
  const active = typeof body.active === "boolean" ? body.active : true;
  return { email, displayName, active };
}

export function parsePatch(body: {
  schemas?: unknown;
  Operations?: { op?: string; path?: string; value?: unknown }[];
}): { active?: boolean; displayName?: string } | null {
  if (!body || !Array.isArray(body.Operations)) return null;
  const result: { active?: boolean; displayName?: string } = {};
  for (const op of body.Operations) {
    const opType = (op.op ?? "replace").toLowerCase();
    if (opType !== "replace" && opType !== "add") continue;
    const path = (op.path ?? "").toLowerCase();
    if (path === "active" && typeof op.value === "boolean") {
      result.active = op.value;
    } else if (path === "displayname" && typeof op.value === "string") {
      result.displayName = op.value;
    } else if (!path && op.value && typeof op.value === "object") {
      const val = op.value as Record<string, unknown>;
      if (typeof val.active === "boolean") result.active = val.active;
      if (typeof val.displayName === "string")
        result.displayName = val.displayName;
    }
  }
  return result;
}
