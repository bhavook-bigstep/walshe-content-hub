import { expect, test } from "@playwright/test";
import { login } from "./_helpers";

// AC48 — studio interaction: panning (drag) moves the viewport, the wheel zooms to the cursor, the
// zoom control sits clear of the bottom-right assistant button, and an entity can be selected and
// deleted. The dotted background is locked to the viewport transform, exposed on the canvas
// container as data-zoom / data-pan / data-entities (the Fabric canvas is opaque to the DOM).

test.beforeEach(async ({ page }) => {
  await login(page, "agent@example.test", /\/agent$/);
  await page.goto("/agent/studio");
  await expect(page.getByTestId("studio-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Fit" }).click(); // known viewport transform
});

test("pan and zoom move the studio viewport; zoom control clears the assistant", async ({ page }) => {
  const canvas = page.getByTestId("studio-canvas");
  const box = (await canvas.boundingBox())!;
  // A point in the empty dotted margin left of the (centred) artboard — clear of entities + panels.
  const px = box.x + box.width * 0.1;
  const py = box.y + box.height * 0.5;

  const panXY = async () => (await canvas.getAttribute("data-pan"))!.split(",").map(Number);
  const zoom = async () => Number(await canvas.getAttribute("data-zoom"));

  // Pan: with the Hand tool (keyboard "h"), dragging the canvas translates the viewport by the drag
  // delta (+140, +90). (In the default Select tool a plain left-drag on empty space draws a marquee
  // instead; the Hand tool — like Space / middle button — pans. AC86.)
  await page.keyboard.press("h");
  const [bx, by] = await panXY();
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px + 140, py + 90, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("v"); // back to the default Select tool
  const [ax, ay] = await panXY();
  expect(Math.abs(ax - bx - 140)).toBeLessThanOrEqual(3);
  expect(Math.abs(ay - by - 90)).toBeLessThanOrEqual(3);

  // Zoom: scrolling up over the canvas zooms in (zoom increases).
  const zBefore = await zoom();
  await page.mouse.move(px, py);
  await page.mouse.wheel(0, -240);
  await expect.poll(zoom).toBeGreaterThan(zBefore);

  // The zoom/fit control does not sit under the bottom-right Q/A assistant button.
  const fit = (await page.getByRole("button", { name: "Fit" }).boundingBox())!;
  const assistant = (await page.getByRole("button", { name: /assistant/i }).first().boundingBox())!;
  const overlaps =
    fit.x < assistant.x + assistant.width &&
    fit.x + fit.width > assistant.x &&
    fit.y < assistant.y + assistant.height &&
    fit.y + fit.height > assistant.y;
  expect(overlaps).toBe(false);
});

test("selecting an entity and pressing Delete removes it", async ({ page }) => {
  const canvas = page.getByTestId("studio-canvas");
  const box = (await canvas.boundingBox())!;

  // The default canvas is empty, so add a rectangle via the right-rail Shapes tool.
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "rect" }).click();
  await page.getByRole("button", { name: "Fit" }).click(); // known transform after adding
  await expect.poll(async () => Number(await canvas.getAttribute("data-entities"))).toBeGreaterThan(0);
  const before = Number(await canvas.getAttribute("data-entities"));

  // The rect defaults to (64,64) 200x200 → centre at artboard (164,164). Map to screen using the
  // viewport transform (scene 0 origin is 0,0): screen = box + pan + artboardCoord * zoom.
  const z = Number(await canvas.getAttribute("data-zoom"));
  const [tx, ty] = (await canvas.getAttribute("data-pan"))!.split(",").map(Number);
  const sx = box.x + tx + 164 * z;
  const sy = box.y + ty + 164 * z;
  expect(sx).toBeGreaterThan(box.x);
  expect(sx).toBeLessThan(box.x + box.width); // the computed point is on the canvas

  // Select the entity, retrying the click until the selection actually registers — the Inspector
  // ("Edit element") only appears for a selected element. A single click can race the canvas render
  // and silently miss, leaving Delete a no-op; that intermittently flaked this smoke test on busy CI
  // runners. Retrying the click until the Inspector shows makes selection deterministic.
  const inspector = page.getByRole("heading", { name: "Edit element" });
  await expect(async () => {
    await page.mouse.click(sx, sy);
    await expect(inspector).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });

  await page.keyboard.press("Delete");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-entities")), { timeout: 15000 })
    .toBe(before - 1);
  await expect(inspector).toBeHidden(); // the only element is gone → the Inspector closes

  // With nothing selected, Delete is a no-op (guards the empty-selection branch).
  await page.keyboard.press("Delete");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-entities")), { timeout: 15000 })
    .toBe(before - 1);
});
