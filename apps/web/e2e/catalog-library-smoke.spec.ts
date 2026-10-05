import { expect, test } from "@playwright/test";
import { chooseOption, login } from "./_helpers";

// AC54 — a provider sorts each entry into one of three sets: Draft (hidden), Public (every agent),
// Private (invited agents only). The catalog carries the invited-agents list. Catalog-level access
// gating for agents is covered by the api tests.
test("provider sets an entry's visibility to public", async ({ page }) => {
  await login(page, "provider@example.test", /\/provider$/);
  await page.goto("/provider/catalog");

  // Invited agents (for private entries) are managed in a dialog opened from the page.
  await page.getByRole("button", { name: /Invite agents/ }).click();
  const invite = page.getByRole("dialog", { name: "Invite agents" });
  await expect(invite).toBeVisible();
  await expect(invite.getByLabel("Agent email")).toBeVisible();
  await invite.getByRole("button", { name: "Close dialog" }).click();
  await expect(invite).toBeHidden();

  await page.getByRole("button", { name: "New entry" }).click();
  const dialog = page.getByRole("dialog", { name: "New entry" });
  const title = `Visible ${Date.now()}`;
  await dialog.getByLabel("Title").fill(title);
  await chooseOption(dialog, "Visibility", /Public/);
  await chooseOption(dialog, "Country", "Ireland");
  await chooseOption(dialog, "State or region", "Galway");
  await dialog.getByRole("button", { name: "Create entry" }).click();

  // The new card appears with a Public badge.
  const card = page.getByRole("link", { name: new RegExp(title) });
  await expect(card).toBeVisible();
  await expect(card.getByText("public", { exact: true })).toBeVisible();
});
