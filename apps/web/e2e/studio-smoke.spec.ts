import { expect, test, type Page } from "@playwright/test";

// The e2e API sends real CORS headers for the web origin (CORS_ORIGINS in playwright.config), so
// the browser calls it directly — no route interception needed.
async function allowApiCors(_page: Page): Promise<void> {
  return;
}

test("studio smoke", async ({ page }) => {
  await allowApiCors(page);

  // Login as the seeded agent (synthetic credentials from app.seed).
  await page.goto("/login");
  await page.getByLabel("Email").fill("agent@example.test");
  await page.getByLabel("Password").fill("demo-pass-0000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agent$/);

  // Browse the catalog (via the branded app-shell nav; AC21).
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("link", { name: "Catalog" }).click();
  await expect(page).toHaveURL(/\/agent\/catalog$/);
  await expect(page.getByRole("heading", { name: "Harbour Festival" })).toBeVisible();

  // Open the studio and pick a format.
  await page.goto("/agent");
  await nav.getByRole("link", { name: "Design Studio" }).click();
  await expect(page.getByRole("heading", { name: "Design Studio" })).toBeVisible();
  const format = page.getByLabel("Format");
  const options = await format.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  await format.selectOption(options[0]);

  // Add a catalog image and a text node.
  await page.getByRole("button", { name: /Add image/ }).click();
  await page.getByLabel("Text content").fill("Smoke test headline");
  await page.getByRole("button", { name: "Add text" }).click();
  await expect(page.locator("canvas").first()).toBeVisible();

  // Export PNG.
  const [png] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PNG" }).click(),
  ]);
  expect(png.suggestedFilename()).toMatch(/\.png$/);

  // Export PDF (server render) and assert the %PDF magic.
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PDF" }).click(),
  ]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  const stream = await pdf.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  expect(Buffer.concat(chunks).subarray(0, 4).toString("latin1")).toBe("%PDF");
});
