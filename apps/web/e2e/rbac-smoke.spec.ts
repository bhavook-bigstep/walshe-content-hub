import { expect, test, type Page } from "@playwright/test";

const API = "http://localhost:8765";
const CORS = {
  "access-control-allow-origin": "http://localhost:3100",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
};

// See studio-smoke.spec.ts: the API has no CORS middleware, so bridge the cross-port calls.
async function allowApiCors(page: Page): Promise<void> {
  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), ...CORS } });
  });
}

test("agent is redirected away from admin", async ({ page }) => {
  await allowApiCors(page);
  await page.goto("/login");
  await page.getByLabel("Email").fill("agent@example.test");
  await page.getByLabel("Password").fill("demo-pass-0000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agent$/);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/agent$/);
  await expect(page.getByRole("heading", { name: "Agent home" })).toBeVisible();
});
