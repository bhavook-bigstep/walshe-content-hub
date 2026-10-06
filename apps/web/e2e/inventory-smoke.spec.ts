import { expect, test } from "@playwright/test";
import { chooseOption, expandSection, login } from "./_helpers";

// AC29 — a provider creates an entry in their catalog and adds a first-class text item (the
// item-based successor to the old structured "custom section"; content now lives in items).
test("provider creates an entry and adds a text item", async ({ page }) => {
  await login(page, "provider@example.test", /\/provider$/);
  await page.goto("/provider/catalog");

  await page.getByRole("button", { name: "New entry" }).click();
  const dialog = page.getByRole("dialog", { name: "New entry" });
  const title = `Expo ${Date.now()}`;
  await dialog.getByLabel("Title").fill(title);
  await expandSection(dialog, "Location & season");
  await chooseOption(dialog, "Country", "Ireland");
  await chooseOption(dialog, "State or region", "Cork");
  await dialog.getByRole("button", { name: "Create entry" }).click();

  // Open the new entry from the catalog grid, then add a text item.
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Add item" }).click();
  const add = page.getByRole("dialog", { name: "Add item" });
  await add.getByLabel("Item text").fill("Free on-site parking");
  await add.getByRole("button", { name: "Add item" }).click();

  await expect(page.getByText("Free on-site parking")).toBeVisible();
});
