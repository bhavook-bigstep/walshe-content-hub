import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC28 — an agent creates a Collection (one of the saved-work features).
test("agent creates a collection", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  await page.goto("/agent/collections");
  const name = `West coast ${Date.now()}`;
  await page.getByLabel("Collection name").fill(name);
  await page.getByRole("button", { name: /^create$/i }).click();

  await expect(page.getByText(name).first()).toBeVisible();
});
