import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC22 — the agent lands on a designed dashboard with stat tiles and a chart (not a bare table).
test("agent dashboard widgets", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  // Stat tiles render once data loads (skeletons → tiles).
  await expect(page.getByTestId("stat-tile").first()).toBeVisible({ timeout: 15000 });
  expect(await page.getByTestId("stat-tile").count()).toBeGreaterThanOrEqual(4);
  await expect(page.getByText("Approved content", { exact: true })).toBeVisible();
  // A real chart renders under its heading.
  await expect(page.getByRole("heading", { name: /engagement by post/i })).toBeVisible();
  await expect(page.getByTestId("engagement-chart")).toBeVisible();
});
