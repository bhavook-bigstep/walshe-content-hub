import { expect, test } from "@playwright/test";
import { login } from "./_helpers";

// AC49 — a provider manages their catalog library: create a catalog, publish it, keep a private
// one. (Catalog-level access gating for agents is covered by the api tests; the agent-facing
// browse/picker UI lands in Increment 3.)
test("provider creates and publishes a catalog", async ({ page }) => {
  await login(page, "provider@example.test", /\/provider$/);
  await page.goto("/provider/catalogs");
  await expect(page.getByRole("heading", { name: "Catalogs", level: 1 })).toBeVisible();

  const form = page.getByRole("form", { name: "New catalog" });
  const name = `Events ${Date.now()}`;
  await form.getByLabel("Catalog name").fill(name);
  await form.getByLabel("Catalog category").fill("events");
  await form.getByLabel("Catalog visibility").selectOption("public");
  await form.getByRole("button", { name: "Create catalog" }).click();

  // The new catalog appears in the library, marked public.
  const list = page.getByRole("list", { name: "Catalog list" });
  const item = list.getByRole("listitem").filter({ hasText: name });
  await expect(item).toBeVisible();
  await expect(item.getByText("public", { exact: true })).toBeVisible();

  // Toggle it back to private — the control + badge flip.
  await item.getByRole("button", { name: /Make private/ }).click();
  await expect(item.getByText("private", { exact: true })).toBeVisible();
  await expect(item.getByRole("button", { name: /Make public/ })).toBeVisible();
});
