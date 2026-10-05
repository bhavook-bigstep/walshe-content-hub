import { expect, test } from "@playwright/test";
import { chooseOption, login } from "./_helpers";

// AC29 / Contract 3 — a provider edits an entry's content and deletes it (self-contained: it
// creates and removes its own entry, so it never disturbs the shared seeded catalog).
test("provider edits then deletes an entry", async ({ page }) => {
  await login(page, "provider@example.test", /\/provider$/);
  await page.goto("/provider/catalog");

  await page.getByRole("button", { name: "New entry" }).click();
  const create = page.getByRole("dialog", { name: "New entry" });
  const title = `Editable ${Date.now()}`;
  await create.getByLabel("Title").fill(title);
  await chooseOption(create, "Country", "Ireland");
  await chooseOption(create, "State or region", "Clare");
  await create.getByRole("button", { name: "Create entry" }).click();

  await page.getByRole("link", { name: new RegExp(title) }).click();

  // Edit the title.
  const edited = `${title} edited`;
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit entry" });
  await edit.getByLabel("Title").fill(edited);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: edited, level: 1 })).toBeVisible();

  // Delete it → routed back to the catalog, entry gone.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const del = page.getByRole("dialog", { name: "Delete entry" });
  await del.getByRole("button", { name: "Delete entry" }).click();
  await expect(page).toHaveURL(/\/provider\/catalog$/);
  await expect(page.getByRole("link", { name: new RegExp(edited) })).toHaveCount(0);
});
