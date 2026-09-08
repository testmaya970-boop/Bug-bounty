import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReplayButton } from "../../components/platform/replay-button";

describe("ReplayButton: structural render only -- the actual click/pending/error transition is a real-browser concern, this codebase's own established convention", () => {
  it("renders a real button labeled 'Replay', not yet pending, no error shown", () => {
    const html = renderToStaticMarkup(<ReplayButton eventId="3fa85f64-5717-4562-b3fc-2c963f66afa6" />);

    expect(html).toContain("Replay");
    expect(html).not.toContain("Replaying");
    expect(html).not.toContain("Queued for reprocessing");
    expect(html).not.toContain('role="alert"');
  });
});
