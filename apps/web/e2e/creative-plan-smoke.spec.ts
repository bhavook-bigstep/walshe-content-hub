import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC41/AC42 — the agent generates a grounded Creative Plan in the studio from approved content.
test("agent generates a grounded creative plan in the studio", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  // AC63 — the studio grounds on a project's collection, so save Harbour Festival to a collection
  // and open that collection in the studio.
  await page.goto("/agent/catalog");
  // Its button may already read "Saved · in N" if an earlier spec saved it (shared e2e DB); either
  // label opens the save modal, and we create a fresh collection holding Harbour.
  const harbour = page.locator("li", { has: page.getByRole("heading", { name: "Harbour Festival" }) });
  await harbour.getByRole("button", { name: /save to collection|saved · in/i }).click();
  const save = page.getByRole("dialog", { name: /save .* to a collection/i });
  const name = `Plan ${Date.now()}`;
  await save.getByLabel("New collection name").fill(name);
  await save.getByRole("button", { name: /create & save/i }).click();

  await page.goto("/agent/collections");
  await page.getByText(name).first().click();
  await page.getByRole("dialog", { name }).getByRole("button", { name: /open in design studio/i }).click();
  await expect(page).toHaveURL(/\/agent\/studio\?project=\d+/);

  // Open the AI dock and wait until the project's collection item has loaded into the dock,
  // so the Planner grounds on it (avoids racing the async media load).
  await page.getByRole("button", { name: "Open the AI studio" }).click();
  await expect(page.getByText(/catalog item.* available/i)).toBeVisible();
  await page.getByRole("button", { name: "Planner" }).click();

  // The Planner turns a brief into a scene-by-scene plan grounded in the open collection's items.
  await page.getByLabel("Planner brief").fill("a cosy autumn weekend in the west of Ireland");
  await page.getByRole("button", { name: /^generate plan$/i }).click();

  // The generated plan is grounded in approved content and names the real seeded item in its copy.
  const plan = page.getByLabel("Editable content plan");
  await expect(plan).toBeVisible();
  await expect(plan).toHaveValue(/Harbour Festival/);
});
