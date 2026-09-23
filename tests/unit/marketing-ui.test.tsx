import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiveWorkflowArtifact } from "../../components/marketing/live-workflow-artifact";
import { LifecycleStepper, type LifecycleStage } from "../../components/marketing/lifecycle-stepper";
import { WorkflowDiagram } from "../../components/marketing/workflow-diagram";
import { ProgramDiscoveryPreview } from "../../components/marketing/program-discovery-preview";

// Both LiveWorkflowArtifact and LifecycleStepper are client components whose motion is
// driven entirely by useEffect (auto-advancing state, and reading prefers-reduced-motion).
// renderToStaticMarkup never runs effects, so what it captures here is exactly the
// reduced-motion / pre-hydration baseline render every real visitor's first paint also
// sees -- the same state a reduced-motion visitor is stuck on forever. That baseline must
// be the fully-revealed, fully-informative one; the interactive/timed behavior itself is
// out of reach of a jsdom-free unit test and is verified live in Chromium instead.

describe("LiveWorkflowArtifact: the hero's record ledger, its reduced-motion/pre-hydration baseline", () => {
  it("is marked aria-hidden -- a screen-reader user already gets the same explanation from real page copy", () => {
    const html = renderToStaticMarkup(<LiveWorkflowArtifact />);
    expect(html).toContain('aria-hidden="true"');
  });

  it("discloses itself as illustrative, once, plainly", () => {
    const html = renderToStaticMarkup(<LiveWorkflowArtifact />);
    expect(html).toContain("Illustrative record.");
  });

  it("shows a real record id and its Open/Closed state", () => {
    const html = renderToStaticMarkup(<LiveWorkflowArtifact />);
    expect(html).toContain("REC-0000842");
    expect(html.includes("Open") || html.includes("Closed")).toBe(true);
  });

  it("the static baseline (no effects run) shows every real lifecycle entry, nothing gated behind animation", () => {
    const html = renderToStaticMarkup(<LiveWorkflowArtifact />);
    expect(html).toContain("Report submitted");
    expect(html).toContain("Evidence attached");
    expect(html).toContain("Triage started");
    expect(html).toContain("Information requested");
    expect(html).toContain("Response received");
    expect(html).toContain("Decision recorded");
    expect(html).toContain("Audit event recorded");
  });

  it("uses real, organic, ascending timestamps -- never round/placeholder times", () => {
    const html = renderToStaticMarkup(<LiveWorkflowArtifact />);
    expect(html).toContain("09:14:02");
    expect(html).toContain("14:28:03");
    expect(html).not.toMatch(/00:00:00/);
  });

  it("renders no researcher/program count or fabricated statistic", () => {
    const html = renderToStaticMarkup(<LiveWorkflowArtifact />);
    expect(html).not.toMatch(/\d+\s*(vulnerabilit|researcher|program)/i);
  });
});

const SAMPLE_STAGES: LifecycleStage[] = [
  { key: "one", label: "Stage one", artifact: <p>First artifact</p> },
  { key: "two", label: "Stage two", artifact: <p>Second artifact</p> },
];

describe("LifecycleStepper: a real button group, not scroll-jacking or a role=tab claim it doesn't back up", () => {
  it("renders a real, independently focusable button for every stage", () => {
    const html = renderToStaticMarkup(<LifecycleStepper stages={SAMPLE_STAGES} />);
    expect(html).toContain("<button");
    expect(html).toContain("Stage one");
    expect(html).toContain("Stage two");
  });

  it("does not claim role=\"tab\" -- that ARIA pattern implies roving-tabindex arrow-key navigation this component does not implement", () => {
    const html = renderToStaticMarkup(<LifecycleStepper stages={SAMPLE_STAGES} />);
    expect(html).not.toContain('role="tab"');
  });

  it("the static baseline shows the first stage's artifact, with later stages present but aria-hidden, not deleted -- reachable by a click, never only by motion", () => {
    const html = renderToStaticMarkup(<LifecycleStepper stages={SAMPLE_STAGES} />);
    // Both artifacts are present in the DOM (a click can always reach either one), but
    // only the active (first) stage's wrapper is aria-hidden="false" -- the rest are
    // aria-hidden="true", not removed.
    const firstPanel = html.indexOf('aria-hidden="false"');
    const secondPanel = html.indexOf('aria-hidden="true"', html.indexOf("Stage two"));
    expect(firstPanel).toBeGreaterThan(-1);
    expect(secondPanel).toBeGreaterThan(-1);
    expect(html.indexOf("First artifact")).toBeGreaterThan(firstPanel);
    expect(html.indexOf("Second artifact")).toBeGreaterThan(secondPanel);
  });

  it("the first stage's button is aria-pressed, the rest are not", () => {
    const html = renderToStaticMarkup(<LifecycleStepper stages={SAMPLE_STAGES} />);
    const firstButtonIndex = html.indexOf("Stage one");
    const secondButtonIndex = html.indexOf("Stage two");
    const ariaPressedTrueIndex = html.indexOf('aria-pressed="true"');
    expect(ariaPressedTrueIndex).toBeGreaterThan(-1);
    expect(ariaPressedTrueIndex).toBeLessThan(firstButtonIndex);
    expect(html.lastIndexOf('aria-pressed="false"')).toBeLessThan(secondButtonIndex);
  });
});

describe("WorkflowDiagram: a vertical sequence, reusable by both researcher and organization sections", () => {
  it("renders every stage label and detail passed in, in order", () => {
    const html = renderToStaticMarkup(
      <WorkflowDiagram
        stages={[
          { label: "Stage one", detail: "first detail" },
          { label: "Stage two", detail: "second detail" },
        ]}
      />,
    );
    expect(html.indexOf("Stage one")).toBeLessThan(html.indexOf("Stage two"));
    expect(html).toContain("first detail");
    expect(html).toContain("second detail");
  });

  it("defaults to the ink/border token set, not the inverted canvas tone", () => {
    const html = renderToStaticMarkup(<WorkflowDiagram stages={[{ label: "Stage", detail: "detail" }]} />);
    expect(html).toContain("text-ink-muted");
    expect(html).not.toContain("text-canvas/60");
  });

  it("tone=\"inverted\" renders with canvas-derived opacity steps instead of ink/border tokens -- readable on a dark (bg-ink) band in both light and dark ambient themes", () => {
    const html = renderToStaticMarkup(<WorkflowDiagram stages={[{ label: "Stage", detail: "detail" }]} tone="inverted" />);
    expect(html).toContain("text-canvas/60");
    expect(html).toContain("text-canvas/75");
    expect(html).not.toContain("text-ink-muted");
  });
});

describe("ProgramDiscoveryPreview: honest, but no longer a major section", () => {
  it("links to the real public listing and discloses that most programs remain invite-only -- no fabricated count of how many are public", () => {
    const html = renderToStaticMarkup(<ProgramDiscoveryPreview />);
    expect(html).toContain('href="/programs"');
    expect(html).toContain("invitation-only");
    // Strip tags/attributes first: a raw markup match would false-positive on the digit
    // inside the Tailwind class "border-l-2", not on rendered content.
    const textOnly = html.replace(/<[^>]+>/g, "");
    expect(textOnly).not.toMatch(/\d/);
  });
});
