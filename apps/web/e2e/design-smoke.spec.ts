import { expect, test, type Page } from "@playwright/test";

// The e2e API sends real CORS headers for the web origin (CORS_ORIGINS in playwright.config), so
// the browser calls it directly — no route interception needed.
async function allowApiCors(_page: Page): Promise<void> {
  return;
}

async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

async function loginAsAgent(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("agent@example.test");
  await page.getByLabel("Password").fill("demo-pass-0000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agent$/);
}

// AC20 — branded public landing page: hero headline + primary CTA into sign-in.
test("landing page shows hero headline and a sign-in CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Voyago" }).first()).toBeVisible();
  const signIn = page.getByRole("link", { name: "Sign in" }).first();
  await expect(signIn).toBeVisible();
  await signIn.click();
  await expect(page).toHaveURL(/\/login$/);
});

// AC23 — responsive: no horizontal overflow on the landing page at mobile width.
test("landing page has no horizontal scroll on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});

// AC21 — branded app shell: Voyago logo + role-aware nav after login.
test("agent app shell shows branded nav and logo", async ({ page }) => {
  await allowApiCors(page);
  await loginAsAgent(page);
  // Expand the icon rail (collapsed by default) to show the labelled nav + Voyago wordmark.
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Catalog" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Design Studio" })).toBeVisible();
  await expect(page.getByRole("img", { name: /voyago/i }).first()).toBeVisible();
});

// AC22 — polished dashboard: stat tiles + a chart render for the agent.
test("agent dashboard renders stat tiles and a designed engagement panel", async ({ page }) => {
  await allowApiCors(page);
  await loginAsAgent(page);
  await expect(page.getByTestId("stat-tile").first()).toBeVisible();
  expect(await page.getByTestId("stat-tile").count()).toBeGreaterThanOrEqual(3);
  // Seeded engagement renders the chart in the engagement slot (data-testid="engagement-chart").
  await expect(page.getByTestId("engagement-chart").first()).toBeVisible();
});

// AC23 — responsive: no horizontal overflow on the agent dashboard at mobile width.
test("agent dashboard has no horizontal scroll on mobile", async ({ page }) => {
  await allowApiCors(page);
  await loginAsAgent(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/agent");
  await expect(page.getByTestId("stat-tile").first()).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});

// AC23 — responsive: no horizontal overflow on the agent catalog at mobile width.
test("agent catalog has no horizontal scroll on mobile", async ({ page }) => {
  await allowApiCors(page);
  await loginAsAgent(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/agent/catalog");
  await expect(page.getByRole("search")).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});

// AC23 — responsive: no horizontal overflow on the Design Studio at mobile width.
test("design studio has no horizontal scroll on mobile", async ({ page }) => {
  await allowApiCors(page);
  await loginAsAgent(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/agent/studio");
  await expect(page.getByTestId("studio-canvas")).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});

// AC21 — page header carries a breadcrumb trail linking back to Home.
test("page header renders a breadcrumb trail", async ({ page }) => {
  await allowApiCors(page);
  await loginAsAgent(page);
  await page.goto("/agent/catalog");
  const crumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumb.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(crumb).toContainText("Catalog");
});
