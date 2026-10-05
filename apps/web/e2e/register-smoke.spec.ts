import { expect, test } from "@playwright/test";
import { allowApiCors } from "./_helpers";

// AC24 — public self-registration creates a Tourism Agent and signs them straight into the agent
// home. A fresh email per run keeps the test hermetic across retries.
test("public register creates an agent and lands on agent home", async ({ page }) => {
  await allowApiCors(page);
  await page.goto("/register");
  await page.getByRole("button", { name: /travel agent/i }).click();

  const email = `agent-${Date.now()}@example.test`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("register-pass-123");
  await page.getByLabel("Confirm password").fill("register-pass-123");
  await page.getByRole("button", { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/agent$/);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
});

// AC25 — a Content Provider self-registers into the review queue and sees the holding screen.
test("provider registration enters the review queue", async ({ page }) => {
  await allowApiCors(page);
  await page.goto("/register");
  await page.getByRole("button", { name: /tourism board/i }).click();

  const email = `prov-${Date.now()}@example.test`;
  await page.getByLabel("Organization").fill("Narnia Tourism");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("register-pass-123");
  await page.getByLabel("Confirm password").fill("register-pass-123");
  await page.getByRole("button", { name: /request access/i }).click();

  await expect(page).toHaveURL(/\/provider/);
  await expect(page.getByText(/application under review/i)).toBeVisible();
});
