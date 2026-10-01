import { expect, test } from "@playwright/test";
import { allowApiCors, hasHorizontalOverflow, login } from "./_helpers";

// AC23 — usable at mobile width: no horizontal overflow on the landing or the agent dashboard.
test("no horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await allowApiCors(page);

  // Public landing.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /verified destination content/i })).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);

  // Authenticated agent dashboard.
  await login(page, "agent@example.test", /\/agent$/);
  await expect(page.getByTestId("stat-tile").first()).toBeVisible({ timeout: 15000 });
  expect(await hasHorizontalOverflow(page)).toBe(false);
});
