import { NextResponse, type NextRequest } from "next/server";
import { readOrganizationLogo } from "@/services/organization-logos";
import { getCurrentUser } from "@/lib/auth/current-user";

// An organization's logo image (202610190006). Served as plain image bytes with no-sniff and a
// locked-down CSP so the response can never be treated as a document. The ?v= version in the
// URL changes whenever the logo does, so the browser may cache each version.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  const logo = await readOrganizationLogo(organizationId, Boolean(user));
  if (!logo) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(logo.bytes), {
    status: 200,
    headers: {
      "Content-Type": logo.contentType,
      "Content-Length": String(logo.bytes.length),
      "Cache-Control": "private, max-age=86400",
      "Last-Modified": new Date(logo.updatedAt).toUTCString(),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
