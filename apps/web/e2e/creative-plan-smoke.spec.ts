import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC41/AC42 — the agent generates a grounded Creative Plan in the studio from approved content.
test("agent generates a grounded creative plan in the studio", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  await page.goto("/agent/studio");
  await page.getByRole("button", { name: /generate creative plan/i }).click();

  const plan = page.getByTestId("creative-plan");
  await expect(plan).toBeVisible();
  // The plan is grounded in approved content and names a real seeded item in its copy.
  await expect(page.getByTestId("plan-status")).toContainText(/grounded/i);
  await expect(plan).toContainText("Harbour Festival");
});
