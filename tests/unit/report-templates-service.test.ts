import { beforeEach, describe, expect, it, vi } from "vitest";

// callRpc binds arguments by POSITION, so the array must follow the SQL signature's order
// exactly: upsert_my_report_template(p_name, p_id, p_weakness_type, p_description_template,
// p_impact_template) (202609020003). A swapped name/id put the template name into the uuid
// parameter and every save failed with a generic error.
const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: "actor-1", platformRole: null, username: "actor", displayName: "Actor", email: null }) }));

const row = { id: "tpl-1", name: "IDOR", weakness_type: "idor", description_template: "d", impact_template: "i", created_at: "2026-09-25T00:00:00Z", updated_at: "2026-09-25T00:00:00Z" };

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("report templates service: upsertMyReportTemplate", () => {
  it("passes arguments in the SQL signature's order -- name first, then id", async () => {
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("upsert_my_report_template")) captured = params;
      return { rows: [row], rowCount: 1 };
    });
    const { upsertMyReportTemplate } = await import("../../services/report-templates");

    await upsertMyReportTemplate({ name: "IDOR", weaknessType: "idor", descriptionTemplate: "d", impactTemplate: "i" });
    expect(captured).toEqual(["IDOR", null, "idor", "d", "i"]);

    await upsertMyReportTemplate({ id: "tpl-1", name: "IDOR v2" });
    expect(captured).toEqual(["IDOR v2", "tpl-1", null, null, null]);
  });
});
