import { beforeEach, describe, expect, it, vi } from "vitest";
import { evidenceObjectStore } from "@/lib/evidence-store";

// services/report-file-evidence.ts's data-access boundary is lib/db/pool.ts's
// withActorTransaction/callRpc -- mocked here at that boundary, same "mock the thin
// data-access layer, exercise the service's own logic for real" pattern used across the
// native-Postgres migration's test suite. A fake PoolClient's `.query` is a controllable
// mock so each test scripts exactly the rows a real query would have returned.
// lib/evidence-store.ts's evidenceObjectStore now implements EvidenceObjectStore against
// S3/MinIO instead of Supabase Storage (Phase 6) -- the interface this test mocks is
// unchanged either way, so the mock below needed no update.
const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: "actor-1", platformRole: null, username: "actor", displayName: "Actor", email: null }) }));
vi.mock("@/lib/evidence-store", () => ({
  evidenceObjectStore: { putObject: vi.fn(), getSignedDownloadUrl: vi.fn(), deleteObject: vi.fn() },
}));

const mockedStore = vi.mocked(evidenceObjectStore);

const TEST_KEY = "evidence/11111111-1111-1111-1111-111111111111";

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}


beforeEach(() => {
  fakeClient.query.mockReset();
  mockedStore.putObject.mockReset().mockResolvedValue(undefined);
  mockedStore.getSignedDownloadUrl.mockReset().mockResolvedValue("https://storage.example/signed");
  mockedStore.deleteObject.mockReset().mockResolvedValue(undefined);
});

// Upload behaviour moved to services/evidence-uploads.ts: see evidence-uploads-service.test.ts.

describe("report-file-evidence service: download authorization is the RLS-scoped read, not the signed-URL step", () => {
  it("returns null without ever calling the storage layer when RLS returns no row (denied and nonexistent look identical)", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.report_evidence")) return queryReturning([]);
      return queryReturning([]);
    });
    const { getEvidenceDownloadUrl } = await import("../../services/report-file-evidence");

    const url = await getEvidenceDownloadUrl("ev-404");

    expect(url).toBeNull();
    expect(mockedStore.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("returns null for a non-file evidence row without calling the storage layer", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.report_evidence")) return queryReturning([{ object_key: null, original_filename: null, evidence_type: "text" }]);
      return queryReturning([]);
    });
    const { getEvidenceDownloadUrl } = await import("../../services/report-file-evidence");

    const url = await getEvidenceDownloadUrl("ev-1");

    expect(url).toBeNull();
    expect(mockedStore.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("on a permitted file row, records the download via RPC and mints a signed URL named after the original filename", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("from public.report_evidence")) return queryReturning([{ object_key: TEST_KEY, original_filename: "screenshot.png", evidence_type: "file" }]);
      if (sql.includes("record_evidence_download")) {
        captured = params;
        return queryReturning([]);
      }
      return queryReturning([]);
    });
    const { getEvidenceDownloadUrl } = await import("../../services/report-file-evidence");

    const url = await getEvidenceDownloadUrl("ev-1");

    expect(captured).toEqual(["ev-1"]);
    expect(mockedStore.getSignedDownloadUrl).toHaveBeenCalledWith(TEST_KEY, "screenshot.png");
    expect(url).toBe("https://storage.example/signed");
  });
});
