import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC27 — an agent edits their profile and their display name shows in the workspace (top-bar menu).
test("agent sets a display name and sees it in the workspace", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  await page.goto("/agent/profile");
  const name = `Alex ${Date.now()}`;
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByRole("status")).toBeVisible();

  // The workspace profile section now shows the new name (expand the icon rail to reveal it).
  await page.reload();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.getByText(name).first()).toBeVisible();
});
