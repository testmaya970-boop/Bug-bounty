import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, listMyReports } from "@/services/reports";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/services/reports", async () => {
  const actual = await vi.importActual<typeof import("@/services/reports")>("@/services/reports");
  return { ...actual, listMyReports: vi.fn() };
});

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedListMyReports = vi.mocked(listMyReports);

beforeEach(() => {
  mockedGetCurrentUser.mockReset();
  mockedListMyReports.mockReset();
});

describe("GET /api/v1/reports: authentication, envelope, status codes, request id", () => {
  it("returns 401 with a stable error envelope and no data query when unauthenticated", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    const { GET } = await import("../../app/api/v1/reports/route");

    const response = await GET(new NextRequest("http://localhost/api/v1/reports"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
    expect(typeof body.error.requestId).toBe("string");
    expect(response.headers.get("X-Request-Id")).toBe(body.error.requestId);
    expect(mockedListMyReports).not.toHaveBeenCalled();
  });

  it("returns 200 with data + meta (requestId, nextCursor) for an authenticated request, forwarding cursor/limit query params", async () => {
    mockedGetCurrentUser.mockResolvedValue({ id: "actor-1", platformRole: null, accountType: "researcher", username: "u", displayName: "U", email: null });
    mockedListMyReports.mockResolvedValue({ items: [{ id: "r1" }] as never, nextCursor: "abc123" });
    const { GET } = await import("../../app/api/v1/reports/route");

    const response = await GET(new NextRequest("http://localhost/api/v1/reports?cursor=xyz&limit=5"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedListMyReports).toHaveBeenCalledWith("actor-1", "xyz", 5);
    expect(body).toMatchObject({ data: [{ id: "r1" }], meta: { nextCursor: "abc123" } });
    expect(response.headers.get("X-Request-Id")).toBe(body.meta.requestId);
  });

  it("rejects an invalid (non-numeric) limit with 422 INVALID_INPUT rather than passing it through", async () => {
    mockedGetCurrentUser.mockResolvedValue({ id: "actor-1", platformRole: null, accountType: "researcher", username: "u", displayName: "U", email: null });
    const { GET } = await import("../../app/api/v1/reports/route");

    const response = await GET(new NextRequest("http://localhost/api/v1/reports?limit=not-a-number"));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(mockedListMyReports).not.toHaveBeenCalled();
  });

  it("maps a service error's own code to the correct HTTP status, never a raw message leak", async () => {
    mockedGetCurrentUser.mockResolvedValue({ id: "actor-1", platformRole: null, accountType: "researcher", username: "u", displayName: "U", email: null });
    mockedListMyReports.mockRejectedValue(new OrganizationServiceError("too many requests", "RATE_LIMITED"));
    const { GET } = await import("../../app/api/v1/reports/route");

    const response = await GET(new NextRequest("http://localhost/api/v1/reports"));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("never leaks a raw, unclassified error to the response body", async () => {
    mockedGetCurrentUser.mockResolvedValue({ id: "actor-1", platformRole: null, accountType: "researcher", username: "u", displayName: "U", email: null });
    mockedListMyReports.mockRejectedValue(new Error('relation "reports" violates check constraint "reports_title_check"'));
    const { GET } = await import("../../app/api/v1/reports/route");

    const response = await GET(new NextRequest("http://localhost/api/v1/reports"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("UNKNOWN");
    expect(JSON.stringify(body)).not.toContain("constraint");
  });
});
