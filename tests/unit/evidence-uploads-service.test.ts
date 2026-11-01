import { beforeEach, describe, expect, it, vi } from "vitest";
import { evidenceObjectStore, evidenceObjectSize, getSignedEvidenceUploadUrl, inspectEvidenceObject } from "@/lib/evidence-store";

// services/evidence-uploads.ts: the database boundary (withActorTransaction) and the storage
// boundary (lib/evidence-store) are mocked; the service's own decisions run for real.
const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return { ...actual, withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)) };
});
vi.mock("@/lib/evidence-store", () => ({
  evidenceObjectStore: { deleteObject: vi.fn() },
  evidenceObjectSize: vi.fn(),
  getSignedEvidenceUploadUrl: vi.fn(),
  inspectEvidenceObject: vi.fn(),
}));

const KEY = "evidence/11111111-1111-1111-1111-111111111111";
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SHA = "c".repeat(64);
const row = (over: Record<string, unknown> = {}) => ({
  id: "up-1",
  draft_id: "draft-1",
  report_id: null,
  visibility: null,
  object_key: KEY,
  original_filename: "shot.png",
  content_type: "image/png",
  size_bytes: 8,
  sha256: null,
  status: "pending",
  created_at: "2026-10-26T00:00:00Z",
  ...over,
});
const calls = () => fakeClient.query.mock.calls.map(([sql]) => String(sql));

/** Scripts the fake client: the staged row for the select, the RPC results by function name. */
function script(staged: ReturnType<typeof row> | null, rpc: Record<string, unknown[]> = {}) {
  fakeClient.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("select * from public.evidence_uploads")) return { rows: staged ? [staged] : [], rowCount: staged ? 1 : 0 };
    const name = Object.keys(rpc).find((fn) => sql.includes(fn));
    const rows = name ? rpc[name] : [];
    return { rows, rowCount: rows.length };
  });
}

beforeEach(() => {
  fakeClient.query.mockReset();
  vi.mocked(evidenceObjectStore.deleteObject).mockReset().mockResolvedValue(undefined);
  vi.mocked(evidenceObjectSize).mockReset();
  vi.mocked(inspectEvidenceObject).mockReset();
  vi.mocked(getSignedEvidenceUploadUrl).mockReset().mockResolvedValue("https://storage.example/signed-put");
});

describe("start: checks before anything is recorded or signed", () => {
  it("refuses a disallowed type or an oversize file without touching the database or storage", async () => {
    const { startEvidenceUpload } = await import("../../services/evidence-uploads");
    await expect(startEvidenceUpload("actor-1", { kind: "draft", draftId: "draft-1" }, "run.exe", 10)).rejects.toMatchObject({ code: "INVALID_EVIDENCE" });
    await expect(startEvidenceUpload("actor-1", { kind: "draft", draftId: "draft-1" }, "big.png", 51 * 1024 * 1024)).rejects.toMatchObject({ code: "INVALID_EVIDENCE" });
    expect(fakeClient.query).not.toHaveBeenCalled();
    expect(getSignedEvidenceUploadUrl).not.toHaveBeenCalled();
  });

  it("records the upload, then signs a PUT for exactly that key, the table's MIME type and the declared size", async () => {
    script(null, { create_evidence_upload: [row()] });
    const { startEvidenceUpload } = await import("../../services/evidence-uploads");
    const started = await startEvidenceUpload("actor-1", { kind: "draft", draftId: "draft-1" }, "shot.PNG", 8);
    expect(getSignedEvidenceUploadUrl).toHaveBeenCalledWith(KEY, "image/png", 8);
    expect(started).toMatchObject({ url: "https://storage.example/signed-put", contentType: "image/png", upload: { id: "up-1", status: "pending" } });
  });
});

describe("complete: only verified bytes become usable", () => {
  it("an upload that never arrived stays pending and says so (retryable), nothing is deleted", async () => {
    script(row());
    vi.mocked(evidenceObjectSize).mockResolvedValue(null);
    const { completeEvidenceUpload } = await import("../../services/evidence-uploads");
    await expect(completeEvidenceUpload("actor-1", "up-1")).rejects.toMatchObject({ code: "UPLOAD_INCOMPLETE" });
    expect(calls().some((sql) => sql.includes("mark_evidence_upload_ready"))).toBe(false);
    expect(evidenceObjectStore.deleteObject).not.toHaveBeenCalled();
  });

  it("a renamed file (signature doesn't match its extension) is deleted, never marked ready", async () => {
    script(row(), { delete_my_evidence_upload: [{ delete_my_evidence_upload: KEY }] });
    vi.mocked(evidenceObjectSize).mockResolvedValue(8);
    vi.mocked(inspectEvidenceObject).mockResolvedValue({ sha256: SHA, head: new TextEncoder().encode("<script>"), size: 8 });
    const { completeEvidenceUpload } = await import("../../services/evidence-uploads");
    await expect(completeEvidenceUpload("actor-1", "up-1")).rejects.toMatchObject({ code: "INVALID_EVIDENCE", message: expect.stringMatching(/doesn't look like a real PNG/) });
    expect(calls().some((sql) => sql.includes("mark_evidence_upload_ready"))).toBe(false);
    expect(evidenceObjectStore.deleteObject).toHaveBeenCalledWith(KEY);
  });

  it("a stored size that differs from the declared one is deleted", async () => {
    script(row(), { delete_my_evidence_upload: [{ delete_my_evidence_upload: KEY }] });
    vi.mocked(evidenceObjectSize).mockResolvedValue(9);
    const { completeEvidenceUpload } = await import("../../services/evidence-uploads");
    await expect(completeEvidenceUpload("actor-1", "up-1")).rejects.toMatchObject({ code: "INVALID_EVIDENCE" });
    expect(inspectEvidenceObject).not.toHaveBeenCalled();
    expect(evidenceObjectStore.deleteObject).toHaveBeenCalledWith(KEY);
  });

  it("a verified draft file is marked ready with the hash computed from the stored bytes", async () => {
    script(row(), { mark_evidence_upload_ready: [row({ status: "ready", sha256: SHA })] });
    vi.mocked(evidenceObjectSize).mockResolvedValue(8);
    vi.mocked(inspectEvidenceObject).mockResolvedValue({ sha256: SHA, head: PNG_HEAD, size: 8 });
    const { completeEvidenceUpload } = await import("../../services/evidence-uploads");
    const done = await completeEvidenceUpload("actor-1", "up-1");
    expect(done).toMatchObject({ upload: { status: "ready" }, evidenceId: null });
    const ready = fakeClient.query.mock.calls.find(([sql]) => String(sql).includes("mark_evidence_upload_ready"));
    expect(ready?.[1]).toEqual(["up-1", SHA]);
    expect(calls().some((sql) => sql.includes("add_researcher_file_evidence"))).toBe(false);
  });

  it("a report file is attached through the existing add-evidence function, organization side with its visibility", async () => {
    const staged = row({ draft_id: null, report_id: "report-1", visibility: "internal" });
    script(staged, {
      mark_evidence_upload_ready: [{ ...staged, status: "ready", sha256: SHA }],
      add_organization_file_evidence: [{ id: "ev-1" }],
      mark_evidence_upload_attached: [{}],
    });
    vi.mocked(evidenceObjectSize).mockResolvedValue(8);
    vi.mocked(inspectEvidenceObject).mockResolvedValue({ sha256: SHA, head: PNG_HEAD, size: 8 });
    const { completeEvidenceUpload } = await import("../../services/evidence-uploads");
    const done = await completeEvidenceUpload("actor-1", "up-1");
    expect(done.evidenceId).toBe("ev-1");
    const add = fakeClient.query.mock.calls.find(([sql]) => String(sql).includes("add_organization_file_evidence"));
    expect(add?.[1]).toEqual(["report-1", KEY, "shot.png", "image/png", 8, SHA, "internal"]);
  });
});
