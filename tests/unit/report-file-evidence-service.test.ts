import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { evidenceObjectStore, generateEvidenceObjectKey } from "@/lib/evidence-store";

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
  generateEvidenceObjectKey: vi.fn(),
}));

const mockedStore = vi.mocked(evidenceObjectStore);
const mockedGenerateKey = vi.mocked(generateEvidenceObjectKey);

const TEST_KEY = "evidence/11111111-1111-1111-1111-111111111111";

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

/** check_evidence_upload_rate_limit's row shape mirrors callRpc's `select * from
 * fn(...)` convention -- one row whose single column is named after the function. */
function rateLimitRow(allowed: boolean) {
  return { check_evidence_upload_rate_limit: allowed };
}

const FILE_ROW = {
  id: "ev-1",
  report_id: "report-1",
  author_id: "actor-1",
  author_context: "researcher",
  visibility: "researcher_visible",
  evidence_type: "file",
  content: null,
  object_key: TEST_KEY,
  original_filename: "screenshot.png",
  content_type: "image/png",
  size_bytes: 3,
  sha256: createHash("sha256").update(new Uint8Array([1, 2, 3])).digest("hex"),
  created_at: "2026-08-27T00:00:00Z",
};

beforeEach(() => {
  fakeClient.query.mockReset();
  mockedStore.putObject.mockReset().mockResolvedValue(undefined);
  mockedStore.getSignedDownloadUrl.mockReset().mockResolvedValue("https://storage.example/signed");
  mockedStore.deleteObject.mockReset().mockResolvedValue(undefined);
  mockedGenerateKey.mockReset().mockReturnValue(TEST_KEY);
});

describe("report-file-evidence service: validation happens before any storage write", () => {
  it("rejects an empty filename without calling putObject", async () => {
    const { addResearcherFileEvidence, OrganizationServiceError } = await import("../../services/report-file-evidence");
    const error: unknown = await addResearcherFileEvidence("report-1", { filename: "   ", contentType: "text/plain", bytes: new Uint8Array([1]) }).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("INVALID_EVIDENCE");
    expect(mockedStore.putObject).not.toHaveBeenCalled();
  });

  it("rejects an empty (zero-byte) file without calling putObject", async () => {
    const { addResearcherFileEvidence, OrganizationServiceError } = await import("../../services/report-file-evidence");
    const error: unknown = await addResearcherFileEvidence("report-1", { filename: "a.txt", contentType: "text/plain", bytes: new Uint8Array([]) }).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("INVALID_EVIDENCE");
    expect(mockedStore.putObject).not.toHaveBeenCalled();
  });

  it("rejects a file over 10 MiB without calling putObject", async () => {
    const { addResearcherFileEvidence, OrganizationServiceError } = await import("../../services/report-file-evidence");
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    const error: unknown = await addResearcherFileEvidence("report-1", { filename: "a.bin", contentType: "application/octet-stream", bytes: oversized }).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("INVALID_EVIDENCE");
    expect(mockedStore.putObject).not.toHaveBeenCalled();
  });
});

describe("report-file-evidence service: hash is computed server-side from the actual bytes, never trusted from the caller", () => {
  it("addResearcherFileEvidence computes SHA-256 over the exact bytes and sends it (and the generated key) to the RPC", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const expectedHash = createHash("sha256").update(bytes).digest("hex");
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("check_evidence_upload_rate_limit")) return queryReturning([rateLimitRow(true)]);
      if (sql.includes("add_researcher_file_evidence")) {
        captured = params;
        return queryReturning([FILE_ROW]);
      }
      return queryReturning([]);
    });
    const { addResearcherFileEvidence } = await import("../../services/report-file-evidence");

    const result = await addResearcherFileEvidence("report-1", { filename: "screenshot.png", contentType: "image/png", bytes });

    expect(mockedStore.putObject).toHaveBeenCalledWith(TEST_KEY, bytes, "image/png");
    // args order per services/report-file-evidence.ts's uploadAndFinalize:
    // [reportId, objectKey, filename, contentType, sizeBytes, sha256]
    expect(captured).toEqual(["report-1", TEST_KEY, "screenshot.png", "image/png", 3, expectedHash]);
    expect(result.evidenceType).toBe("file");
    expect(result.sha256).toBe(FILE_ROW.sha256);
  });

  it("addOrganizationFileEvidence additionally sends the caller-chosen visibility, and defaults content type when none is supplied", async () => {
    const bytes = new Uint8Array([9, 9]);
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("check_evidence_upload_rate_limit")) return queryReturning([rateLimitRow(true)]);
      if (sql.includes("add_organization_file_evidence")) {
        captured = params;
        return queryReturning([{ ...FILE_ROW, author_context: "organization", visibility: "internal" }]);
      }
      return queryReturning([]);
    });
    const { addOrganizationFileEvidence } = await import("../../services/report-file-evidence");

    await addOrganizationFileEvidence("report-1", { filename: "note.bin", contentType: "", bytes }, "internal");

    expect(mockedStore.putObject).toHaveBeenCalledWith(TEST_KEY, bytes, "application/octet-stream");
    // args order per uploadAndFinalize's organization branch:
    // [reportId, objectKey, filename, contentType, sizeBytes, sha256, visibility]
    expect(captured).toEqual(["report-1", TEST_KEY, "note.bin", "application/octet-stream", 2, expect.any(String), "internal"]);
  });
});

describe("report-file-evidence service: an object is never orphaned by a failed finalize without an attempted cleanup", () => {
  function mockRateLimitOkButFinalizeRejects(finalizeMessage: string) {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("check_evidence_upload_rate_limit")) return queryReturning([rateLimitRow(true)]);
      throw new Error(finalizeMessage);
    });
  }

  it("deletes the just-uploaded object when the finalize RPC rejects, then still surfaces the mapped error", async () => {
    mockRateLimitOkButFinalizeRejects("FORBIDDEN: only the submitting researcher can add evidence to this report");
    const { addResearcherFileEvidence, OrganizationServiceError } = await import("../../services/report-file-evidence");

    const error: unknown = await addResearcherFileEvidence("report-1", { filename: "a.txt", contentType: "text/plain", bytes: new Uint8Array([1]) }).catch((thrown) => thrown);

    expect(mockedStore.putObject).toHaveBeenCalled();
    expect(mockedStore.deleteObject).toHaveBeenCalledWith(TEST_KEY);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("FORBIDDEN");
  });

  it("does not itself throw when the best-effort cleanup delete also fails -- the original RPC error still surfaces", async () => {
    mockRateLimitOkButFinalizeRejects("FORBIDDEN: only the submitting researcher can add evidence to this report");
    mockedStore.deleteObject.mockRejectedValue(new Error("storage unavailable"));
    const { addResearcherFileEvidence, OrganizationServiceError } = await import("../../services/report-file-evidence");

    const error: unknown = await addResearcherFileEvidence("report-1", { filename: "a.txt", contentType: "text/plain", bytes: new Uint8Array([1]) }).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("FORBIDDEN");
  });
});

describe("report-file-evidence service: the upload rate limit is checked BEFORE any storage write, never after", () => {
  it("throws RATE_LIMITED and never calls putObject when the rate-limit RPC returns false", async () => {
    let calledFinalize = false;
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("check_evidence_upload_rate_limit")) return queryReturning([rateLimitRow(false)]);
      if (sql.includes("add_researcher_file_evidence")) calledFinalize = true;
      return queryReturning([FILE_ROW]);
    });
    const { addResearcherFileEvidence, OrganizationServiceError } = await import("../../services/report-file-evidence");

    const error: unknown = await addResearcherFileEvidence("report-1", { filename: "a.txt", contentType: "text/plain", bytes: new Uint8Array([1]) }).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("RATE_LIMITED");
    expect(mockedStore.putObject).not.toHaveBeenCalled();
    expect(calledFinalize).toBe(false);
  });

  it("checks the rate limit for organization uploads too, before any storage write", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("check_evidence_upload_rate_limit")) return queryReturning([rateLimitRow(false)]);
      return queryReturning([FILE_ROW]);
    });
    const { addOrganizationFileEvidence, OrganizationServiceError } = await import("../../services/report-file-evidence");

    const error: unknown = await addOrganizationFileEvidence("report-1", { filename: "a.txt", contentType: "text/plain", bytes: new Uint8Array([1]) }, "internal").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("RATE_LIMITED");
    expect(mockedStore.putObject).not.toHaveBeenCalled();
  });

  it("fails closed (surfaces a mapped error, never proceeds) if the rate-limit RPC call itself errors -- a deliberate, scoped choice distinct from sign-in's fail-open behavior", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("check_evidence_upload_rate_limit")) throw new Error("connection reset");
      return queryReturning([FILE_ROW]);
    });
    const { addResearcherFileEvidence, OrganizationServiceError } = await import("../../services/report-file-evidence");

    const error: unknown = await addResearcherFileEvidence("report-1", { filename: "a.txt", contentType: "text/plain", bytes: new Uint8Array([1]) }).catch((thrown) => thrown);

    // "connection reset" has no CODE: message shape, so mapRpcError maps it to the
    // generic UNKNOWN code rather than leaking the raw database/connection error.
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("UNKNOWN");
    expect(mockedStore.putObject).not.toHaveBeenCalled();
  });

  it("still validates input before ever reaching the rate-limit RPC -- cheap, local checks come first", async () => {
    const { addResearcherFileEvidence, OrganizationServiceError } = await import("../../services/report-file-evidence");

    const error: unknown = await addResearcherFileEvidence("report-1", { filename: "   ", contentType: "text/plain", bytes: new Uint8Array([1]) }).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("INVALID_EVIDENCE");
    expect(fakeClient.query).not.toHaveBeenCalled();
  });
});

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
