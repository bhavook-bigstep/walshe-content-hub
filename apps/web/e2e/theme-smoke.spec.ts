import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC30 — the light/dark toggle switches the whole app's theme and the choice is remembered.
test("agent can switch between light and dark themes", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);

  const theme = () => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  const before = await theme();
  const bgBefore = await bodyBg();

  await page.getByRole("button", { name: /switch to (light|dark) mode/i }).first().click();
  await page.waitForTimeout(300);

  const after = await theme();
  expect(after).not.toBe(before);
  expect(await bodyBg()).not.toBe(bgBefore);

  // The choice persists across a reload (no flash back to the default).
  await page.reload();
  await page.waitForTimeout(500);
  expect(await theme()).toBe(after);
});
