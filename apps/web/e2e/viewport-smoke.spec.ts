import { expect, test, type Page } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

// AC26 — the signed-in workspace is a fixed viewport: the document itself never scrolls (overflow
// is bounded inside internal regions), and there is no horizontal overflow.
async function fitsViewport(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollHeight <= d.clientHeight + 1 && d.scrollWidth <= d.clientWidth + 1;
  });
}

test("agent workspace fits the viewport with no page scroll", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);
  await page.waitForTimeout(700);
  expect(await fitsViewport(page)).toBe(true);

  await page.goto("/agent/catalog");
  await page.waitForTimeout(700);
  expect(await fitsViewport(page)).toBe(true);
});

test("provider holding screen fits the viewport", async ({ page }) => {
  await allowApiCors(page);
  await page.goto("/register");
  await page.getByRole("button", { name: /tourism board/i }).click();

  const email = `prov-vp-${Date.now()}@example.test`;
  await page.getByLabel("Organization").fill("Viewport Board");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("register-pass-123");
  await page.getByLabel("Confirm password").fill("register-pass-123");
  await page.getByRole("button", { name: /request access/i }).click();

  await expect(page.getByText(/application under review/i)).toBeVisible();
  await page.waitForTimeout(400);
  expect(await fitsViewport(page)).toBe(true);
});
