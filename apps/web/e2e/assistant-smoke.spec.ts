import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC38/AC39 — the assistant answers in plain language, grounded in approved content the agent can see.
test("agent asks the assistant and gets a grounded reply", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  await page.goto("/agent/assistant");
  await page.getByLabel("Ask the assistant").fill("find events in Galway");
  await page.getByRole("button", { name: "Send" }).click();

  // The reply names a seeded, approved Galway event — proof it answered from the real catalog.
  await expect(page.getByTestId("assistant-log")).toContainText("Harbour Festival");
});

// AC40 — the overview surfaces "suggested next posts" so the agent never starts from a blank screen.
test("agent overview shows suggested next posts", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  await expect(page.getByTestId("suggestions")).toBeVisible();
  await expect(page.getByTestId("suggestions").locator("li").first()).toBeVisible();
});
