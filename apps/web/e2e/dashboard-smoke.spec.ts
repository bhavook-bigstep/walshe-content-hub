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
  // No seeded engagement — the dashboard shows its *designed* empty state (a titled card with a
  // CTA, not a bare table). The real chart renders once an agent publishes and metrics arrive.
  await expect(page.getByRole("heading", { name: /no engagement yet/i })).toBeVisible();
});
