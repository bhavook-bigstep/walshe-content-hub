import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC31 — the agent workspace features are wired end-to-end.

// Browse the catalog and save an approved item into a brand-new collection without leaving the page.
test("agent adds a catalog item to a collection", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  await page.goto("/agent/catalog");

  // Open the collection picker on the first approved card.
  const collectButton = page.getByRole("button", { name: /save to collection|saved · in/i }).first();
  await expect(collectButton).toBeVisible();
  await collectButton.click();

  const dialog = page.getByRole("dialog", { name: /save .* to a collection/i });
  await expect(dialog).toBeVisible();

  const name = `Trip ideas ${Date.now()}`;
  await dialog.getByLabel("New collection name").fill(name);
  await dialog.getByRole("button", { name: /create & save/i }).click();

  // A confirmation toast proves the save round-tripped through the API.
  await expect(page.getByRole("status").filter({ hasText: /saved/i })).toBeVisible();

  // And the new collection now holds the item.
  await page.goto("/agent/collections");
  await expect(page.getByText(name).first()).toBeVisible();
});

// Create a project from a template (which saves it + autosaves), then re-open it from Projects.
test("agent opens a saved project in the studio", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  // Using a template creates a saved project and opens it in the studio.
  await page.goto("/agent/templates");
  const card = page.locator(".card.group").first();
  await card.hover();
  await card.getByRole("button", { name: "Preview" }).click({ force: true });
  await page.getByRole("dialog").getByRole("button", { name: /use template/i }).click();
  await expect(page).toHaveURL(/\/agent\/studio\?project=\d+/);
  await expect(page.getByTestId("studio-canvas")).toBeVisible();

  // Re-open it from the Projects list (a table row with an icon action button).
  await page.goto("/agent/projects");
  const open = page.getByRole("button", { name: /open .* in the design studio/i }).first();
  await expect(open).toBeVisible();
  await open.click();

  await expect(page).toHaveURL(/\/agent\/studio\?project=\d+/);
  await expect(page.getByTestId("studio-canvas")).toBeVisible();
});
