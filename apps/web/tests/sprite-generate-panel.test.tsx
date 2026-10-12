import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GenerateAssetsPanel from "../components/studio/GenerateAssetsPanel";

// The AI-studio "Generate Assets" section creates workspace assets from a description and stores
// them: an animated sprite (→ Sprites) or a still image (→ Media). Rendered to static markup
// (react-dom/server, no jsdom — matches this repo's panel-contract tests) to verify both generation
// controls are present.

describe("GenerateAssetsPanel", () => {
  it("renders the sprite and image generation controls", () => {
    const html = renderToStaticMarkup(<GenerateAssetsPanel />);
    expect(html).toContain("Sprite (animated)");
    expect(html).toContain("Image (still)");
    expect(html).toContain('aria-label="Describe a sprite to generate"');
    expect(html).toContain('aria-label="Describe an image to generate"');
    // Two Generate buttons (one per section).
    expect(html.match(/>Generate</g)?.length).toBe(2);
  });
});
