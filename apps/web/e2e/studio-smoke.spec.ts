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

  // Open the studio.
  await page.goto("/agent");
  await nav.getByRole("link", { name: "Design Studio" }).click();
  await expect(page.getByTestId("studio-canvas")).toBeVisible();

  // Pick a format (menu bar → Size menu).
  await page.getByRole("button", { name: "Size" }).click();
  await page.getByRole("menuitem", { name: /Social image/ }).click();

  // Add a text element (right-rail Text tool → Heading preset).
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await expect(page.locator("canvas").first()).toBeVisible();

  // Export PNG (menu bar → File menu).
  await page.getByRole("button", { name: "File" }).click();
  const [png] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Export as PNG" }).click(),
  ]);
  expect(png.suggestedFilename()).toMatch(/\.png$/);

  // Export PDF (server render) and assert the %PDF magic.
  await page.getByRole("button", { name: "File" }).click();
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Export as PDF" }).click(),
  ]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  const stream = await pdf.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  expect(Buffer.concat(chunks).subarray(0, 4).toString("latin1")).toBe("%PDF");
});
