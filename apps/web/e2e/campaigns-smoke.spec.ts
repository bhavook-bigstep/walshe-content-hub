import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

test("agent creates a campaign and sees its calendar", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);
  await page.goto("/agent/campaigns");

  const name = `Australia ${Date.now()}`;
  await page.getByLabel("Campaign name").fill(name);
  await page.getByLabel("Starts on").fill("2026-08-01");
  await page.getByLabel("Ends on").fill("2026-08-31");
  await page.getByRole("button", { name: /create campaign/i }).click();

  await expect(page.getByText(name).first()).toBeVisible();
  await page.getByText(name).first().click();
  await expect(page.getByTestId("campaign-calendar")).toBeVisible();
});
