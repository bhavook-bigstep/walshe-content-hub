import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC29 — a provider builds a structured catalog entry and adds a custom section for content that
// falls outside the type's template.
test("provider creates a structured entry with a custom section", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "provider@example.test", /\/provider$/);

  await page.goto("/provider/catalog/new");
  const title = `Expo ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Destination").fill("Cork");

  await page.getByRole("button", { name: /add custom section/i }).click();
  await page.getByPlaceholder("Section title").fill("Parking");
  await page.getByPlaceholder("Section content").fill("Free on-site");

  await page.getByRole("button", { name: /create entry/i }).click();
  await expect(page.getByText(/has been created/i)).toBeVisible();
});
