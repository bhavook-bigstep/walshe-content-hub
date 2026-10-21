import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ContentPlanPanel from "../components/studio/ContentPlanPanel";

// The Planner (plan → build): a vague brief → an editable scene-by-scene plan → "Send to Builder".
// Static markup render (react-dom/server, no jsdom) to verify the control surface is present.

describe("ContentPlanPanel", () => {
  it("renders the brief input and generate action", () => {
    const html = renderToStaticMarkup(<ContentPlanPanel itemIds={[7]} onUsePlan={() => {}} />);
    expect(html).toContain('aria-label="Planner brief"');
    expect(html).toContain(">Generate plan<");
    // The editable draft + "Send to Builder" only appear after a plan is generated (client state),
    // so they aren't in the initial static markup — the brief + generate affordance are the contract.
    expect(html).toContain("scene-by-scene plan");
  });
});
