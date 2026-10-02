import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC31 — the agent workspace features are wired end-to-end.

// Browse the catalog and save an approved item into a brand-new collection without leaving the page.
test("agent adds a catalog item to a collection", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  await page.goto("/agent/catalog");

  // Open the collection picker on the first approved card.
  const collectButton = page.getByRole("button", { name: /add to collection|saved · in/i }).first();
  await expect(collectButton).toBeVisible();
  await collectButton.click();

  const dialog = page.getByRole("dialog", { name: /add .* to a collection/i });
  await expect(dialog).toBeVisible();

  const name = `Trip ideas ${Date.now()}`;
  await dialog.getByLabel("New collection name").fill(name);
  await dialog.getByRole("button", { name: /^create$/i }).click();

  // A confirmation toast proves the save round-tripped through the API.
  await expect(page.getByRole("status").filter({ hasText: /saved/i })).toBeVisible();

  // And the new collection now holds the item.
  await page.goto("/agent/collections");
  await expect(page.getByText(name).first()).toBeVisible();
});

// Save a design in the Studio, then re-open it from Projects via the ?project route.
test("agent opens a saved project in the studio", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  await page.goto("/agent/studio");
  await page.getByRole("button", { name: /save to projects/i }).click();
  await expect(page.getByText(/saved to projects/i)).toBeVisible();
  await expect(page.getByText(/^Editing:/)).toBeVisible();

  // Re-open it from the Projects list.
  await page.goto("/agent/projects");
  const open = page.getByRole("link", { name: /open in studio/i }).first();
  await expect(open).toBeVisible();
  await open.click();

  await expect(page).toHaveURL(/\/agent\/studio\?project=\d+/);
  await expect(page.getByText(/^Editing:/)).toBeVisible();
});
