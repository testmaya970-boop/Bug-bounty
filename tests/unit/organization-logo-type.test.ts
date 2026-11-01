import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/pool", () => ({ withActorTransaction: vi.fn(), withServiceRoleTransaction: vi.fn(), callRpc: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
import { detectLogoType } from "../../services/organization-logos";

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe("detectLogoType: the file's own bytes decide, never its name or MIME type", () => {
  it("recognizes PNG, JPEG and WebP", () => {
    expect(detectLogoType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(detectLogoType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectLogoType(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")))).toBe("image/webp");
  });
  it("refuses SVG, GIF and anything else", () => {
    expect(detectLogoType(bytes(...ascii('<svg xmlns="http://www.w3.org/2000/svg">')))).toBeNull();
    expect(detectLogoType(bytes(...ascii("GIF89a")))).toBeNull();
    expect(detectLogoType(bytes())).toBeNull();
  });
});
