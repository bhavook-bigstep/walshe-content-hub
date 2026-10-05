import { expect, test } from "@playwright/test";
import { chooseOption, expandSection, login } from "./_helpers";

// AC54 — a provider sorts each entry into one of three sets: Draft (hidden), Public (every agent),
// Private (invited agents only). The catalog carries the invited-agents list. Catalog-level access
// gating for agents is covered by the api tests.
test("provider sets an entry's visibility to public", async ({ page }) => {
  await login(page, "provider@example.test", /\/provider$/);
  await page.goto("/provider/catalog");

  await page.getByRole("button", { name: "New entry" }).click();
  const dialog = page.getByRole("dialog", { name: "New entry" });
  const title = `Visible ${Date.now()}`;
  await dialog.getByLabel("Title").fill(title);
  await chooseOption(dialog, "Visibility", /Public/);
  await expandSection(dialog, "Location & season");
  await chooseOption(dialog, "Country", "Ireland");
  await chooseOption(dialog, "State or region", "Galway");
  await dialog.getByRole("button", { name: "Create entry" }).click();

  // The new card appears with a Public badge.
  const card = page.getByRole("link", { name: new RegExp(title) });
  await expect(card).toBeVisible();
  await expect(card.getByText("public", { exact: true })).toBeVisible();
});
