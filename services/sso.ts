import type { ScimUserRecord } from "../lib/scim";

export interface SsoConnection {
  id: string;
  organizationId: string;
  idpEntityId: string;
  idpSsoUrl: string;
  allowJit: boolean;
  defaultRole: string;
  roleAttribute: string | null;
  roleMappings: Record<string, string>;
  status: "active" | "inactive";
  enforced: boolean;
  scimTokenLast4: string | null;
}

export function ssoUrls(connectionId: string): {
  acsUrl: string;
  entityId: string;
  metadataUrl: string;
  scimBase: string;
} {
  const origin = (process.env.APP_ORIGIN ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return {
    acsUrl: `${origin}/api/sso/saml/${connectionId}/acs`,
    entityId: `${origin}/api/sso/saml/${connectionId}/metadata`,
    metadataUrl: `${origin}/api/sso/saml/${connectionId}/metadata`,
    scimBase: `${origin}/api/scim/v2/${connectionId}`,
  };
}

export async function getSsoConnection(
  _organizationId: string,
): Promise<SsoConnection | null> {
  return null;
}

export async function saveSsoConnection(
  _organizationId: string,
  _input: {
    idpEntityId: string;
    idpSsoUrl: string;
    idpCertificate: string;
    allowJit: boolean;
    defaultRole: string;
    roleAttribute: string;
    roleMappings: Record<string, string>;
  },
): Promise<void> {}

export async function setSsoState(
  _organizationId: string,
  _active: boolean,
  _enforced: boolean,
): Promise<void> {}

export async function rotateScimToken(_organizationId: string): Promise<string> {
  return "";
}

export async function deleteSsoConnection(
  _organizationId: string,
): Promise<void> {}

export async function ssoRedirectForEmail(
  _email: string,
): Promise<string | null> {
  return null;
}

export async function completeSsoLogin(
  _connectionId: string,
  _payload: { SAMLResponse: string },
): Promise<{ organizationId: string } | { error: string }> {
  return { error: "Could not complete single sign-on." };
}

export async function scimConnection(
  _connectionId: string,
  authHeader: string | null,
): Promise<{ id: string; organizationId: string } | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return null;
}

export async function scimListUsers(
  _organizationId: string,
  _emailFilter: string | null,
  _startIndex: number,
  _count: number,
): Promise<{ total: number; users: ScimUserRecord[] }> {
  return { total: 0, users: [] };
}

export async function scimGetUser(
  _organizationId: string,
  _userId: string,
): Promise<ScimUserRecord | null> {
  return null;
}

export async function scimCreateUser(
  _connectionId: string,
  _email: string,
  _displayName: string | null,
  _active: boolean,
): Promise<string> {
  return "";
}

export async function scimRename(
  _organizationId: string,
  _userId: string,
  _displayName: string,
): Promise<void> {}

export async function scimSetActive(
  _connectionId: string,
  _userId: string,
  _active: boolean,
): Promise<void> {}
