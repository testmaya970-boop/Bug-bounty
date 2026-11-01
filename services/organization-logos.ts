import "server-only";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";

// Organization logos (202610190006): small PNG/JPEG/WebP images shown wherever an
// organization's programs appear. Logo existence and version are not sensitive (the logo is as
// public as the organization's name on its programs), so they are read with the service role.

export const LOGO_MAX_BYTES = 256 * 1024;
export type LogoContentType = "image/png" | "image/jpeg" | "image/webp";

/** The real type from the file's first bytes -- never the browser-supplied name or MIME type.
 * SVG and everything else return null. */
export function detectLogoType(bytes: Uint8Array): LogoContentType | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** organization id -> logo version (its updated_at), for the organizations given. Missing = no logo. */
export async function getOrganizationLogoVersions(organizationIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(organizationIds)];
  if (ids.length === 0) return {};
  const rows = await withServiceRoleTransaction((client) =>
    client.query<{ organization_id: string; updated_at: string }>("select organization_id, updated_at from public.organization_logos where organization_id = any($1::uuid[])", [ids]).then((r) => r.rows),
  );
  return Object.fromEntries(rows.map((r) => [r.organization_id, new Date(r.updated_at).getTime().toString(36)]));
}

/** The image for the logo route. Signed-in viewers can see any logo; anonymous visitors only the
 * logos of organizations with a live public program (the ones they can already browse). */
export async function readOrganizationLogo(organizationId: string, viewerSignedIn: boolean): Promise<{ contentType: LogoContentType; bytes: Buffer; updatedAt: string } | null> {
  const rows = await withServiceRoleTransaction((client) =>
    client
      .query<{ content_type: LogoContentType; bytes: Buffer; updated_at: string; publicly_listed: boolean }>(
        `select l.content_type, l.bytes, l.updated_at,
                exists (select 1 from public.programs p join public.organizations o on o.id = p.organization_id
                         where p.organization_id = l.organization_id and p.visibility = 'public' and p.status in ('active', 'paused') and o.status <> 'suspended') as publicly_listed
           from public.organization_logos l where l.organization_id = $1`,
        [organizationId],
      )
      .then((r) => r.rows),
  );
  const row = rows[0];
  if (!row || (!viewerSignedIn && !row.publicly_listed)) return null;
  return { contentType: row.content_type, bytes: row.bytes, updatedAt: new Date(row.updated_at).toISOString() };
}

export async function setOrganizationLogo(organizationId: string, bytes: Uint8Array): Promise<void> {
  if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) throw new OrganizationServiceError("The image must be 256 KB or smaller.", "INVALID_LOGO");
  const type = detectLogoType(bytes);
  if (!type) throw new OrganizationServiceError("Use a PNG, JPEG or WebP image.", "INVALID_LOGO");
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.set_organization_logo", [organizationId, type, Buffer.from(bytes)]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function removeOrganizationLogo(organizationId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.remove_organization_logo", [organizationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** One organization's logo version, for its own pages' header. */
export async function getOrganizationLogoVersion(organizationId: string): Promise<string | undefined> {
  return (await getOrganizationLogoVersions([organizationId]))[organizationId];
}
