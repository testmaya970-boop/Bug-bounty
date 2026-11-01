import { beforeEach, describe, expect, it, vi } from "vitest";

// The "New programs for you" switch (202610210005) was rejected by the action's own category
// check, so it could never be saved even though the database accepts it.
const fakeClient = { query: vi.fn() };
vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return { ...actual, withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)) };
});
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: "actor-1", platformRole: null, username: "actor", displayName: "Actor", email: null })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { setNotificationPreferenceAction } from "../../actions/notifications";

beforeEach(() => {
  fakeClient.query.mockReset();
  fakeClient.query.mockResolvedValue({ rows: [{ user_id: "actor-1", category: "program_recommendations", email_enabled: false }], rowCount: 1 });
});

describe("setNotificationPreferenceAction", () => {
  it("saves the program recommendations category", async () => {
    const result = await setNotificationPreferenceAction("program_recommendations", false);
    expect(result.ok).toBe(true);
    const call = fakeClient.query.mock.calls.find(([sql]) => String(sql).includes("set_notification_preference"));
    expect(call?.[1]).toEqual(["program_recommendations", false]);
  });

  it("still refuses a mandatory category before reaching the database", async () => {
    const result = await setNotificationPreferenceAction("bounty_activity", false);
    expect(result.ok).toBe(false);
    expect(fakeClient.query).not.toHaveBeenCalled();
  });
});
