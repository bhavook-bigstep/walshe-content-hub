import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SpriteImportPanel from "../components/studio/SpriteImportPanel";
import { newDesign } from "../lib/studio/ops";

// The sprite panel gains an "AI generate" affordance: describe a sprite, the server renders a sheet
// and slices it into an animation that lands in the grid (same pipeline as an upload). Rendered to
// static markup (react-dom/server, no jsdom — matches this repo's panel-contract tests) to verify
// the generation control surface is present.

describe("SpriteImportPanel — AI sprite generation", () => {
  it("renders the generate-with-AI input and button", () => {
    const html = renderToStaticMarkup(
      <SpriteImportPanel design={newDesign("social")} sceneIndex={0} onChange={() => {}} />,
    );
    expect(html).toContain("Generate a sprite with AI"); // the prompt input placeholder
    expect(html).toContain(">Generate<"); // the generate button label
    expect(html).toContain('aria-label="Describe a sprite to generate with AI"');
  });
});
