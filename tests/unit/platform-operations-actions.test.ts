import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/current-user";
import { replayDeadLetteredOutboxEvent } from "@/services/platform-operations";
import { OrganizationServiceError } from "@/services/rpc-error";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/services/platform-operations", () => ({ replayDeadLetteredOutboxEvent: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedReplay = vi.mocked(replayDeadLetteredOutboxEvent);

beforeEach(() => {
  mockedGetCurrentUser.mockReset();
  mockedReplay.mockReset();
});

describe("replayDeadLetteredOutboxEventAction: authentication gates it here; authority is the database's own job", () => {
  it("rejects a malformed event id as INVALID_INPUT without ever checking auth or calling the service", async () => {
    const { replayDeadLetteredOutboxEventAction } = await import("../../actions/platform-operations");

    const result = await replayDeadLetteredOutboxEventAction({ eventId: "not-a-uuid" });

    expect(result).toEqual({ ok: false, code: "INVALID_INPUT", message: expect.any(String) });
    expect(mockedGetCurrentUser).not.toHaveBeenCalled();
    expect(mockedReplay).not.toHaveBeenCalled();
  });

  it("rejects with AUTH_REQUIRED when there is no session, without calling the service", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    const { replayDeadLetteredOutboxEventAction } = await import("../../actions/platform-operations");

    const result = await replayDeadLetteredOutboxEventAction({ eventId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" });

    expect(result).toEqual({ ok: false, code: "AUTH_REQUIRED", message: expect.any(String) });
    expect(mockedReplay).not.toHaveBeenCalled();
  });

  it("calls the service and returns ok:true on success -- the database, not this action, is what actually enforced platform-admin authority", async () => {
    mockedGetCurrentUser.mockResolvedValue({ id: "user-1", platformRole: null, accountType: "researcher", username: "u", displayName: "U", email: "u@example.test" });
    mockedReplay.mockResolvedValue(undefined);
    const { replayDeadLetteredOutboxEventAction } = await import("../../actions/platform-operations");

    const result = await replayDeadLetteredOutboxEventAction({ eventId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" });

    expect(result).toEqual({ ok: true });
    expect(mockedReplay).toHaveBeenCalledWith("3fa85f64-5717-4562-b3fc-2c963f66afa6", undefined);
  });

  it("maps a FORBIDDEN rejection (a non-admin's session somehow reached this far) to a clean, typed failure", async () => {
    mockedGetCurrentUser.mockResolvedValue({ id: "user-1", platformRole: null, accountType: "researcher", username: "u", displayName: "U", email: "u@example.test" });
    mockedReplay.mockRejectedValue(new OrganizationServiceError("platform admin authority required", "FORBIDDEN"));
    const { replayDeadLetteredOutboxEventAction } = await import("../../actions/platform-operations");

    const result = await replayDeadLetteredOutboxEventAction({ eventId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" });

    expect(result).toEqual({ ok: false, code: "FORBIDDEN", message: "platform admin authority required" });
  });
});
