import { expect, test } from "@playwright/test";

// NON-mocked proof of the headless render page: the REAL /studio/render route served by
// `next start` (playwright.config webServer), driven by the test's own Chromium. Unlike the
// vitest render-browser tests (which inject a fake launcher), this fails if the route 404s, the
// hooks never install, or the renderer emits a blank/invalid PNG. Synthetic fixture only.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const job = {
  sceneIndex: 0,
  times: [0],
  design: {
    format: "social",
    width: 400,
    height: 300,
    scenes: [
      {
        id: "scene-smoke-1",
        name: "Smoke",
        nodes: [
          { id: "bg", type: "background", x: 0, y: 0, width: 400, height: 300, color: "#102a43" },
          { id: "box", type: "shape", shape: "rect", x: 40, y: 40, width: 200, height: 120, color: "#f0b429" },
          { id: "t1", type: "text", x: 60, y: 200, width: 280, height: 50, text: "Synthetic smoke", color: "#ffffff", fontSize: 32 },
        ],
      },
    ],
  },
};

test("render page serves 200, becomes ready, and renders a valid non-blank PNG", async ({ page }) => {
  const response = await page.goto("/studio/render");
  expect(response?.status()).toBe(200);

  await page.waitForFunction("window.__studioRenderReady === true", undefined, { timeout: 30_000 });

  const result = await page.evaluate(async (j) => {
    const w = window as unknown as {
      __studioRender: (j: unknown) => Promise<{ pngs: string[]; width: number; height: number; broken_images: string[] }>;
    };
    const r = await w.__studioRender(j);
    // Decode in-page and count distinct pixel colours to prove the image is not blank.
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("png_decode_failed"));
      img.src = r.pngs[0];
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    return { ...r, decodedW: img.naturalWidth, decodedH: img.naturalHeight, distinctColours: colours.size };
  }, job);

  expect(result.pngs).toHaveLength(1);
  expect(result.pngs[0].startsWith("data:image/png;base64,")).toBe(true);
  const bytes = Buffer.from(result.pngs[0].split(",")[1], "base64");
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  expect(bytes.readUInt32BE(16)).toBe(result.width);
  expect(bytes.readUInt32BE(20)).toBe(result.height);
  expect(result.decodedW).toBe(result.width);
  expect(result.decodedH).toBe(result.height);
  expect(result.broken_images).toEqual([]);
  // Background + rect + text must yield several colours; a blank canvas would have exactly one.
  expect(result.distinctColours).toBeGreaterThan(2);
});
