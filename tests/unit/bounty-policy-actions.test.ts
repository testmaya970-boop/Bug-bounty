import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../services/bounty", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/bounty")>();
  return { ...actual, createBountyPolicyVersion: vi.fn() };
});

import { createBountyPolicyVersionAction } from "../../actions/bounty";
import * as bountyService from "../../services/bounty";

const ids = { organizationId: "11111111-1111-4111-8111-111111111111", programId: "22222222-2222-4222-8222-222222222222" };
const tier = (min: number, max: number) => ({ min, max });
const paying = { none: tier(0, 0), low: tier(0, 10000), medium: tier(10000, 50000), high: tier(50000, 150000), critical: tier(150000, 500000) };

beforeEach(() => vi.clearAllMocks());

describe("bounty policy: only payable tables", () => {
  it("refuses a currency the prepaid balance can't hold", async () => {
    const result = await createBountyPolicyVersionAction({ ...ids, currency: "EUR" as "USD", ranges: paying });
    expect(result).toMatchObject({ ok: false, message: "Choose USD or INR." });
    expect(bountyService.createBountyPolicyVersion).not.toHaveBeenCalled();
  });

  it("refuses an all-zero table", async () => {
    const zero = { none: tier(0, 0), low: tier(0, 0), medium: tier(0, 0), high: tier(0, 0), critical: tier(0, 0) };
    const result = await createBountyPolicyVersionAction({ ...ids, currency: "USD", ranges: zero });
    expect(result.ok).toBe(false);
    expect(bountyService.createBountyPolicyVersion).not.toHaveBeenCalled();
  });

  it("accepts a paying INR table", async () => {
    vi.mocked(bountyService.createBountyPolicyVersion).mockResolvedValue({} as never);
    const result = await createBountyPolicyVersionAction({ ...ids, currency: "INR", ranges: paying });
    expect(result.ok).toBe(true);
  });
});
