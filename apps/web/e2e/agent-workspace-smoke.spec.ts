import { expect, test } from "@playwright/test";
import { login } from "./_helpers";

// AC59–AC63 — the redesigned agent workspace: catalog library → save references → collection
// detail → start a studio project; entry detail modal; template Preview/Use.
test("agent: open entry modal, save to collection, manage it, start a project", async ({ page }) => {
  await login(page, "agent@example.test", /\/agent$/);
  await page.goto("/agent/catalog");

  // Clicking an entry opens its items in a modal (AC61).
  await page.getByRole("button", { name: /^Open / }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  // Save the entry into a new collection (AC59).
  await page.getByRole("button", { name: /save to collection/i }).first().click();
  const save = page.getByRole("dialog", { name: /save .* to a collection/i });
  const name = `Workspace ${Date.now()}`;
  await save.getByLabel("New collection name").fill(name);
  await save.getByRole("button", { name: /create & save/i }).click();
  await expect(page.getByRole("status").filter({ hasText: /saved/i })).toBeVisible();

  // Open the collection → it holds the item → start a project in the studio (AC60/AC63).
  await page.goto("/agent/collections");
  await page.getByText(name).first().click();
  const detail = page.getByRole("dialog", { name });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("list", { name: "Collection items" })).toBeVisible();
  await detail.getByRole("button", { name: /open in design studio/i }).click();
  await expect(page).toHaveURL(/\/agent\/studio\?project=\d+/);
});

test("templates show Preview and Use", async ({ page }) => {
  await login(page, "agent@example.test", /\/agent$/);
  await page.goto("/agent/templates");

  const card = page.locator(".card.group").first();
  await card.hover();
  await card.getByRole("button", { name: "Preview" }).click({ force: true });
  const preview = page.getByRole("dialog");
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: /use template/i }).click();
  await expect(page).toHaveURL(/\/agent\/studio\?template=/);
});
