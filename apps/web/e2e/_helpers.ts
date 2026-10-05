import { type Locator, type Page, expect } from "@playwright/test";

// Pick a value from a custom <Select> (components/ui/Select): open the trigger by its accessible
// name, then click the option. `scope` is a page or a dialog/region locator.
export async function chooseOption(
  scope: Page | Locator,
  label: string,
  optionText: string | RegExp,
): Promise<void> {
  await scope.getByRole("button", { name: label }).click();
  await scope.getByRole("option", { name: optionText }).click();
}

// The e2e API now sends real CORS headers for the web origin (CORS_ORIGINS in playwright.config),
// so the browser calls it directly. This is a no-op kept for call-site compatibility — no brittle
// route interception (which raced and disposed responses).
export async function allowApiCors(_page: Page): Promise<void> {
  return;
}

// Log in with a seeded synthetic account (from app.seed) and wait for the role landing route.
export async function login(page: Page, email: string, landing: RegExp): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("demo-pass-0000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(landing);
}

// True when the document scrolls horizontally (a responsive failure).
export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}
