import { expect, test, type Page } from "@playwright/test";
import { allowApiCors } from "./_helpers";

const PASSWORD = "demo-pass-0000";

async function loginAs(page: Page, email: string, landing: RegExp): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login");
  try {
    await page.evaluate(() => localStorage.clear());
  } catch {
    /* storage may be unavailable before first paint */
  }
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(landing);
}

// AC45 — an agent run shows up in the admin trace view (content-free).
test("admin sees an agent run in the trace view", async ({ page }) => {
  await allowApiCors(page);

  // An agent uses the assistant → a trace is recorded.
  await loginAs(page, "agent@example.test", /\/agent$/);
  await page.getByTestId("assistant-launcher").click();
  await page.getByLabel("Ask the assistant").fill("find events in Galway");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("assistant-log")).toContainText("Harbour Festival");

  // The admin trace view lists it.
  await loginAs(page, "admin@example.test", /\/admin$/);
  await page.goto("/admin/traces");
  await expect(page.getByTestId("traces-table")).toBeVisible();
  await expect(page.getByTestId("traces-table")).toContainText("Assistant");
});
